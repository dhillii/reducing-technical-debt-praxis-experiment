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

    return this.getReceiverPublicKey(userId).then(localKey => {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return this.checkKeyExists(localKey);
    });
};

Keychain.prototype.checkKeyExists = function(localKey) {
    return this._publicKeyDao.getByUserId(localKey.userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return this.updateKey(localKey, cloudKey);
    }).catch(err => {
        if (err && err.code === 42) {
            return localKey;
        }
        throw err;
    });
};

Keychain.prototype.updateKey = function(localKey, newKey) {
    if (this.shouldOverridePermission(localKey, newKey)) {
        return this.permissionGranted(localKey, newKey);
    } else {
        return this.requestPermission(localKey, newKey);
    }
};

Keychain.prototype.shouldOverridePermission = function(localKey, newKey) {
    return localKey.overridePermission;
};

Keychain.prototype.requestPermission = function(localKey, newKey) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({
            userId: localKey.userId,
            newKey: newKey
        }, granted => {
            if (!granted) {
                resolve(localKey);
                return;
            }
            this.permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

Keychain.prototype.permissionGranted = function(localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) {
            return;
        }
        return this.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a receiver's public key by user id
 * @param userId [String] the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    const self = this;

    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = this.findPublicKeyByUserId(allPubkeys, userId);
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return this._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (!cloudPubkey) {
                return;
            }
            return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
        }).catch(err => {
            if (err && err.code === 42) {
                return;
            }
            throw err;
        });
    });
};

Keychain.prototype.findPublicKeyByUserId = function(allPubkeys, userId) {
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

    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = _.findWhere(allPubkeys, {
            userId: userId
        });

        if (pubkey && pubkey._id && !pubkey.source) {
            return this.syncKeypair(pubkey._id);
        }

        return this._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return this.syncKeypair(cloudPubkey._id);
            }
        });
    });
};

Keychain.prototype.syncKeypair = function(keypairId) {
    return this.lookupPublicKey(keypairId).then(pub => {
        return this.lookupPrivateKey(keypairId).then(priv => {
            const keys = {};

            if (pub && pub.publicKey) {
                keys.publicKey = pub;
            }
            if (priv && priv.encryptedKey) {
                keys.privateKey = priv;
            }

            return keys;
        });
    });
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    const self = this;

    if (!this.isValidKeyPair(keypair)) {
        return new Promise((resolve, reject) => {
            reject(new Error('Cannot put user key pair: Incorrect input!'));
        });
    }

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey).then(() => {
        return this._publicKeyDao.put(keypair.publicKey);
    }).then(() => {
        return this.saveLocalPrivateKey(keypair.privateKey);
    });
};

Keychain.prototype.isValidKeyPair = function(keypair) {
    return keypair && keypair.publicKey && keypair.privateKey && keypair.publicKey.userId && keypair.publicKey.userId === keypair.privateKey.userId;
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    const self = this;

    if (!this.isValidPublicKey(publicKey)) {
        return new Promise((resolve, reject) => {
            reject(new Error('Cannot upload user key pair: Incorrect input!'));
        });
    }

    return this._publicKeyDao.put(publicKey);
};

Keychain.prototype.isValidPublicKey = function(publicKey) {
    return publicKey && publicKey.userId && publicKey.publicKey;
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
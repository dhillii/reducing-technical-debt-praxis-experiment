'use strict';

var ngModule = angular.module('woServices');
ngModule.service('keychain', Keychain);
module.exports = Keychain;

var DB_PUBLICKEY = 'publickey',
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
    var str = this._appConfig.string;
    var message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
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
    var self = this,
        userId = options.userId,
        overridePermission = options.overridePermission;

    return self.getReceiverPublicKey(userId).then(function(localKey) {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return checkKeyExists(localKey);
    });

    function checkKeyExists(localKey) {
        return self._publicKeyDao.getByUserId(userId).then(function(cloudKey) {
            if (cloudKey && cloudKey._id === localKey._id) {
                return localKey;
            }
            return updateKey(localKey, cloudKey);
        }).catch(function(err) {
            if (err && err.code === 42) {
                return localKey;
            }
            throw err;
        });
    }

    function updateKey(localKey, newKey) {
        if (overridePermission) {
            return permissionGranted(localKey, newKey);
        }
        return requestPermission(localKey, newKey);
    }

    function requestPermission(localKey, newKey) {
        return new Promise(function(resolve, reject) {
            self.requestPermissionForKeyUpdate({
                userId: userId,
                newKey: newKey
            }, function(granted) {
                if (!granted) {
                    resolve(localKey);
                    return;
                }
                permissionGranted(localKey, newKey).then(resolve).catch(reject);
            });
        });
    }

    function permissionGranted(localKey, newKey) {
        return self.removeLocalPublicKey(localKey._id).then(function() {
            if (!newKey) {
                return;
            }
            return self.saveLocalPublicKey(newKey).then(function() {
                return newKey;
            });
        });
    }
};

/**
 * Look up a receiver's public key by user id
 * @param userId [String] the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    var self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        return findLocalPublicKey(allPubkeys, userId);
    }).then(function(pubkey) {
        if (pubkey && pubkey._id) {
            return pubkey;
        }
        return self._publicKeyDao.getByUserId(userId).then(onKeyReceived).catch(onError);
    });

    function findLocalPublicKey(allPubkeys, userId) {
        var pubkey = _.findWhere(allPubkeys, {
            userId: userId
        });
        if (pubkey) {
            return pubkey;
        }
        for (var i = 0, match; i < allPubkeys.length; i++) {
            var userIds = self._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
            match = _.findWhere(userIds, {
                emailAddress: userId
            });
            if (match) {
                return allPubkeys[i];
            }
        }
        return null;
    }

    function onKeyReceived(cloudPubkey) {
        if (!cloudPubkey) {
            return;
        }
        return self.saveLocalPublicKey(cloudPubkey).then(function() {
            return cloudPubkey;
        });
    }

    function onError(err) {
        if (err && err.code === 42) {
            return;
        }
        throw err;
    }
};

//
// Keypair functions
//

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * @return {Object} The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function(userId) {
    var self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        var pubkey = _.findWhere(allPubkeys, {
            userId: userId
        });

        if (pubkey && pubkey._id && !pubkey.source) {
            return syncKeypair(pubkey._id);
        }

        return self._publicKeyDao.getByUserId(userId).then(function(cloudPubkey) {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return syncKeypair(cloudPubkey._id);
            }
            return null;
        });
    });

    function syncKeypair(keypairId) {
        return self.lookupPublicKey(keypairId).then(function(pub) {
            var savedPubkey = pub;
            return self.lookupPrivateKey(keypairId);
        }).then(function(priv) {
            var savedPrivkey = priv;
            var keys = {};

            if (savedPubkey && savedPubkey.publicKey) {
                keys.publicKey = savedPubkey;
            }
            if (savedPrivkey && savedPrivkey.encryptedKey) {
                keys.privateKey = savedPrivkey;
            }

            return keys;
        });
    }
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param {Object} keypair The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    var self = this;

    if (!validateKeyPair(keypair)) {
        return new Promise(function() {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

    keypair.publicKey.imported = true;

    return self.saveLocalPublicKey(keypair.publicKey).then(function() {
        return self._publicKeyDao.put(keypair.publicKey);
    }).then(function() {
        return self.saveLocalPrivateKey(keypair.privateKey);
    });

    function validateKeyPair(keypair) {
        if (!keypair || !keypair.publicKey || !keypair.privateKey || !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
            return false;
        }
        return true;
    }
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    var self = this;

    if (!validatePublicKey(publicKey)) {
        return new Promise(function() {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }

    return self._publicKeyDao.put(publicKey);

    function validatePublicKey(publicKey) {
        if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
            return false;
        }
        return true;
    }
};

//
// Helper functions
//

/**
 * Lookup a public key by id from local storage or cloud
 * @param {String} id The public key id
 * @return {Promise}
 */
Keychain.prototype.lookupPublicKey = function(id) {
    var self = this,
        cloudPubkey;

    if (!id) {
        return new Promise(function() {
            throw new Error('ID must be set for public key query!');
        });
    }

    return self._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(function(pubkey) {
        if (pubkey) {
            return pubkey;
        }

        return self._publicKeyDao.get(id).then(function(pub) {
            cloudPubkey = pub;
            return self.saveLocalPublicKey(cloudPubkey);
        }).then(function() {
            return cloudPubkey;
        });
    });
};

/**
 * List all the locally stored public keys
 */
Keychain.prototype.listLocalPublicKeys = function() {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

/**
 * Remove a local public key by id
 * @param {String} id The public key id
 */
Keychain.prototype.removeLocalPublicKey = function(id) {
    return this._lawnchairDAO.remove(DB_PUBLICKEY + '_' + id);
};

/**
 * Lookup a private key by id from local storage
 * @param {String} id The private key id
 */
Keychain.prototype.lookupPrivateKey = function(id) {
    return this._lawnchairDAO.read(DB_PRIVATEKEY + '_' + id);
};

/**
 * Persist a public key to local storage
 * @param {Object} pubkey The public key object
 */
Keychain.prototype.saveLocalPublicKey = function(pubkey) {
    var pkLookupKey = DB_PUBLICKEY + '_' + pubkey._id;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

/**
 * Persist a private key to local storage
 * @param {Object} privkey The private key object
 */
Keychain.prototype.saveLocalPrivateKey = function(privkey) {
    var prkLookupKey = DB_PRIVATEKEY + '_' + privkey._id;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};
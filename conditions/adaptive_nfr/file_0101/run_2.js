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
    const message = (params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey)
        .replace('{0}', params.userId);

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

    return self.getReceiverPublicKey(userId).then(function(localKey) {
        if (!localKey || !localKey._id) {
            return;
        }
        if (localKey.imported) {
            return localKey;
        }
        return checkKeyExists(localKey);
    });

    /**
     * Checks if the user's key has been revoked by looking up the key id
     */
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

    /**
     * Determines update strategy based on permission override flag
     */
    function updateKey(localKey, newKey) {
        return overridePermission
            ? permissionGranted(localKey, newKey)
            : requestPermission(localKey, newKey);
    }

    /**
     * Requests user permission to update the public key
     */
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

    /**
     * Persists the new key after permission is granted
     */
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
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        const pubkey = findPublicKeyByUserId(allPubkeys, userId);
        
        if (pubkey && pubkey._id) {
            return pubkey;
        }

        return self._publicKeyDao.getByUserId(userId)
            .then(onKeyReceived)
            .catch(onError);
    });

    /**
     * Searches for public key by primary userId or secondary userIds
     */
    function findPublicKeyByUserId(allPubkeys, userId) {
        let pubkey = _.findWhere(allPubkeys, { userId: userId });
        
        if (!pubkey) {
            for (let i = 0; i < allPubkeys.length; i++) {
                const userIds = self._pgp.getKeyParams(allPubkeys[i].publicKey).userIds;
                const match = _.findWhere(userIds, { emailAddress: userId });
                if (match) {
                    pubkey = allPubkeys[i];
                    break;
                }
            }
        }
        
        return pubkey;
    }

    /**
     * Handles successful key retrieval from cloud
     */
    function onKeyReceived(cloudPubkey) {
        if (!cloudPubkey) {
            return;
        }
        return self.saveLocalPublicKey(cloudPubkey).then(function() {
            return cloudPubkey;
        });
    }

    /**
     * Handles error during key retrieval
     */
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
 * return [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function(userId) {
    const self = this;

    return self._lawnchairDAO.list(DB_PUBLICKEY).then(function(allPubkeys) {
        const pubkey = _.findWhere(allPubkeys, { userId: userId });

        if (pubkey && pubkey._id && !pubkey.source) {
            return syncKeypair(pubkey._id);
        }

        return self._publicKeyDao.getByUserId(userId).then(function(cloudPubkey) {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return syncKeypair(cloudPubkey._id);
            }
        });
    });

    /**
     * Synchronizes keypair between local and cloud storage
     */
    function syncKeypair(keypairId) {
        let savedPubkey;
        let savedPrivkey;

        return self.lookupPublicKey(keypairId).then(function(pub) {
            savedPubkey = pub;
            return self.lookupPrivateKey(keypairId);
        }).then(function(priv) {
            savedPrivkey = priv;
        }).then(function() {
            const keys = {};

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
 * @param [Object] The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    const self = this;

    if (!isValidKeypair(keypair)) {
        return new Promise(function() {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

    keypair.publicKey.imported = true;

    return self.saveLocalPublicKey(keypair.publicKey)
        .then(function() {
            return self._publicKeyDao.put(keypair.publicKey);
        })
        .then(function() {
            return self.saveLocalPrivateKey(keypair.privateKey);
        });

    /**
     * Validates keypair structure and consistency
     */
    function isValidKeypair(keypair) {
        return keypair && 
               keypair.publicKey && 
               keypair.privateKey && 
               keypair.publicKey.userId && 
               keypair.publicKey.userId === keypair.privateKey.userId;
    }
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    const self = this;

    if (!isValidPublicKey(publicKey)) {
        return new Promise(function() {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }

    return self._publicKeyDao.put(publicKey);

    /**
     * Validates public key structure
     */
    function isValidPublicKey(publicKey) {
        return publicKey && publicKey.userId && publicKey.publicKey;
    }
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function(id) {
    const self = this;
    let cloudPubkey;

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
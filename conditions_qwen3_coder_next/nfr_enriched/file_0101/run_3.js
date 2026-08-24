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
    const str = this._appConfig.string;
    const message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
    const formattedMessage = message.replace('{0}', params.userId);

    this._dialog.confirm({
        title: str.updatePublicKeyTitle,
        message: formattedMessage,
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
    const userId = options.userId;
    const overridePermission = options.overridePermission;

    return this.getReceiverPublicKey(userId)
        .then(localKey => {
            if (!localKey || !localKey._id || localKey.imported) {
                return localKey || null;
            }
            return checkKeyExists.call(this, userId, localKey);
        });

    function checkKeyExists(userId, localKey) {
        return this._publicKeyDao.getByUserId(userId)
            .then(cloudKey => {
                if (cloudKey && cloudKey._id === localKey._id) {
                    return localKey;
                }
                return updateKey.call(this, localKey, cloudKey, overridePermission);
            })
            .catch(err => {
                if (err && err.code === 42) {
                    return localKey;
                }
                throw err;
            });
    }

    function updateKey(localKey, newKey, overridePermission) {
        if (overridePermission) {
            return permissionGranted.call(this, localKey, newKey);
        }
        return requestPermission.call(this, localKey, newKey, userId);
    }

    function requestPermission(localKey, newKey, userId) {
        return new Promise((resolve, reject) => {
            this.requestPermissionForKeyUpdate({
                userId,
                newKey
            }, granted => {
                if (!granted) {
                    resolve(localKey);
                    return;
                }
                permissionGranted.call(this, localKey, newKey)
                    .then(resolve)
                    .catch(reject);
            });
        });
    }

    function permissionGranted(localKey, newKey) {
        if (!newKey) {
            return Promise.resolve();
        }
        return this.removeLocalPublicKey(localKey._id)
            .then(() => this.saveLocalPublicKey(newKey))
            .then(() => newKey);
    }
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId The receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function(userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => findPublicKeyInLocalStorage(allPubkeys, userId, this._pgp))
        .then(pubkey => {
            if (pubkey) {
                return pubkey;
            }
            return this._publicKeyDao.getByUserId(userId)
                .then(onKeyReceived.bind(this))
                .catch(onError);
        });

    function findPublicKeyInLocalStorage(allPubkeys, userId, pgp) {
        let pubkey = _.findWhere(allPubkeys, { userId });

        if (!pubkey) {
            for (let i = 0; i < allPubkeys.length; i++) {
                const keyParams = pgp.getKeyParams(allPubkeys[i].publicKey);
                const match = _.findWhere(keyParams.userIds, { emailAddress: userId });
                if (match) {
                    pubkey = allPubkeys[i];
                    break;
                }
            }
        }

        return pubkey;
    }

    function onKeyReceived(cloudPubkey) {
        if (!cloudPubkey) {
            return null;
        }
        return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
    }

    function onError(err) {
        if (err && err.code === 42) {
            return null;
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
    return this._lawnchairDAO.list(DB_PUBLICKEY)
        .then(allPubkeys => findUserPublicKey(allPubkeys, userId))
        .then(localPubkey => {
            if (localPubkey && localPubkey._id && !localPubkey.source) {
                return syncKeypair.call(this, localPubkey._id);
            }
            return this._publicKeyDao.getByUserId(userId)
                .then(cloudPubkey => {
                    if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                        return syncKeypair.call(this, cloudPubkey._id);
                    }
                    return {};
                });
        });

    function findUserPublicKey(allPubkeys, userId) {
        return _.findWhere(allPubkeys, { userId }) || null;
    }

    function syncKeypair(keypairId) {
        let savedPubkey, savedPrivkey;

        return this.lookupPublicKey(keypairId)
            .then(pub => {
                savedPubkey = pub;
                return this.lookupPrivateKey(keypairId);
            })
            .then(priv => {
                savedPrivkey = priv;
            })
            .then(() => buildKeyPair(savedPubkey, savedPrivkey));
    }

    function buildKeyPair(savedPubkey, savedPrivkey) {
        const keys = {};
        if (savedPubkey && savedPubkey.publicKey) {
            keys.publicKey = savedPubkey;
        }
        if (savedPrivkey && savedPrivkey.encryptedKey) {
            keys.privateKey = savedPrivkey;
        }
        return keys;
    }
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist arccordingly
 * @param {Object} keypair The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function(keypair) {
    validateUserKeyPairInput(keypair);

    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function(publicKey) {
    validatePublicKeyInput(publicKey);

    return this._publicKeyDao.put(publicKey);
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function(id) {
    validateKeyId(id);

    return this._lawnchairDAO.read(DB_PUBLICKEY + '_' + id)
        .then(localPubkey => {
            if (localPubkey) {
                return localPubkey;
            }
            return this._publicKeyDao.get(id)
                .then(cloudPubkey => {
                    return this.saveLocalPublicKey(cloudPubkey)
                        .then(() => cloudPubkey);
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

// Internal validation helpers

function validateUserKeyPairInput(keypair) {
    if (!keypair ||
        !keypair.publicKey ||
        !keypair.privateKey ||
        !keypair.publicKey.userId ||
        keypair.publicKey.userId !== keypair.privateKey.userId) {
        throw new Error('Cannot put user key pair: Incorrect input!');
    }
}

function validatePublicKeyInput(publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        throw new Error('Cannot upload user key pair: Incorrect input!');
    }
}

function validateKeyId(id) {
    if (!id) {
        throw new Error('ID must be set for public key query!');
    }
}
```javascript
'use strict';

var ngModule = angular.module('woServices');
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
 * @param {Boolean} [options.overridePermission] If true, update without prompting the user.
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const { userId, overridePermission } = options;
    return this.getReceiverPublicKey(userId).then(localKey => {
        if (!localKey || !localKey._id) return;
        if (localKey.imported) return localKey;
        return this._checkKeyExists(userId, localKey, overridePermission);
    });
};

/**
 * Check if the user's key exists on the server and handle updates.
 * @private
 */
Keychain.prototype._checkKeyExists = function (userId, localKey, overridePermission) {
    return this._publicKeyDao.getByUserId(userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return this._updateKey(localKey, cloudKey, overridePermission, userId);
    }).catch(err => {
        if (err && err.code === 42) return localKey; // offline
        throw err;
    });
};

/**
 * Decide whether to request permission or apply update directly.
 * @private
 */
Keychain.prototype._updateKey = function (localKey, newKey, overridePermission, userId) {
    if (overridePermission) {
        return this._permissionGranted(localKey, newKey);
    }
    return this._requestPermission(localKey, newKey, userId);
};

/**
 * Prompt the user for permission to update the public key.
 * @private
 */
Keychain.prototype._requestPermission = function (localKey, newKey, userId) {
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
 * Apply the key update after permission is granted.
 * @private
 */
Keychain.prototype._permissionGranted = function (localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) return;
        return this.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a receiver's public key by user id.
 * @param {String} userId The receiver's email address.
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    return this._findLocalPublicKey(userId).then(pubkey => {
        if (pubkey && pubkey._id) return pubkey;
        return this._publicKeyDao.getByUserId(userId)
            .then(cloudKey => this._handleCloudKey(cloudKey))
            .catch(err => {
                if (err && err.code === 42) return; // offline
                throw err;
            });
    });
};

/**
 * Search local storage for a public key matching the user id.
 * @private
 */
Keychain.prototype._findLocalPublicKey = function (userId) {
    return this._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const primary = _.findWhere(allPubkeys, { userId });
        if (primary) return primary;

        for (const key of allPubkeys) {
            const userIds = this._pgp.getKeyParams(key.publicKey).userIds;
            const match = _.findWhere(userIds, { emailAddress: userId });
            if (match) return key;
        }
        return null;
    });
};

/**
 * Persist a cloud‑fetched key locally and return it.
 * @private
 */
Keychain.prototype._handleCloudKey = function (cloudPubkey) {
    if (!cloudPubkey) return;
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

/**
 * Get the local user's key pair, synchronizing with the cloud if needed.
 * @param {String} userId The user's email address.
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
 * Synchronize a keypair (public & private) from the cloud to local storage.
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
        if (savedPubkey && savedPubkey.publicKey) keys.publicKey = savedPubkey;
        if (savedPrivkey && savedPrivkey.encryptedKey) keys.privateKey = savedPrivkey;
        return keys;
    });
};

/**
 * Store a user's key pair after validation.
 * @param {Object} keypair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    if (!this._isValidKeypair(keypair)) {
        return new Promise(() => { throw new Error('Cannot put user key pair: Incorrect input!'); });
    }

    // Prevent automatic deletion checks for this key
    keypair.publicKey.imported = true;

    return this.saveLocalPublicKey(keypair.publicKey)
        .then(() => this._publicKeyDao.put(keypair.publicKey))
        .then(() => this.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Validate the structure of a keypair object.
 * @private
 */
Keychain.prototype._isValidKeypair = function (keypair) {
    return keypair &&
        keypair.publicKey && keypair.privateKey &&
        keypair.publicKey.userId &&
        keypair.publicKey.userId === keypair.privateKey.userId;
};

/**
 * Upload a public key after validation.
 * @param {Object} publicKey The user's public key.
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return new Promise(() => { throw new Error('Cannot upload user key pair: Incorrect input!'); });
    }
    return this._publicKeyDao.put(publicKey);
};

/**
 * Lookup a public key by id, fetching from cloud if missing locally.
 * @param {String} id The key identifier.
 */
Keychain.prototype.lookupPublicKey = function (id) {
    if (!id) {
        return new Promise(() => { throw new Error('ID must be set for public key query!'); });
    }

    return this._lawnchairDAO.read(`${DB_PUBLICKEY}_${id}`).then(pubkey => {
        if (pubkey) return pubkey;
        return this._publicKeyDao.get(id).then(cloudPubkey => {
            return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
        });
    });
};

/**
 * List all locally stored public keys.
 */
Keychain.prototype.listLocalPublicKeys = function () {
    return this._lawnchairDAO.list(DB_PUBLICKEY);
};

Keychain.prototype.removeLocalPublicKey = function (id) {
    return this._lawnchairDAO.remove(`${DB_PUBLICKEY}_${id}`);
};

Keychain.prototype.lookupPrivateKey = function (id) {
    return this._lawnchairDAO.read(`${DB_PRIVATEKEY}_${id}`);
};

Keychain.prototype.saveLocalPublicKey = function (pubkey) {
    const pkLookupKey = `${DB_PUBLICKEY}_${pubkey._id}`;
    return this._lawnchairDAO.persist(pkLookupKey, pubkey);
};

Keychain.prototype.saveLocalPrivateKey = function (privkey) {
    const prkLookupKey = `${DB_PRIVATEKEY}_${privkey._id}`;
    return this._lawnchairDAO.persist(prkLookupKey, privkey);
};
```
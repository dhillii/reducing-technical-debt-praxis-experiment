```javascript
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

/**
 * Display confirmation dialog to request a public key update
 * @param {Object} params.newKey The user's updated public key object
 * @param {String} params.userId The user's email address
 */
Keychain.prototype.requestPermissionForKeyUpdate = function (params, callback) {
    const str = this._appConfig.string;
    let message = params.newKey ? str.updatePublicKeyMsgNewKey : str.updatePublicKeyMsgRemovedKey;
    message = message.replace('{0}', params.userId);

    this._dialog.confirm({
        title: str.updatePublicKeyTitle,
        message,
        positiveBtnStr: str.updatePublicKeyPosBtn,
        negativeBtnStr: str.updatePublicKeyNegBtn,
        showNegativeBtn: true,
        callback
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
 * @param {Boolean} [options.overridePermission] If true, update automatically; otherwise ask user
 */
Keychain.prototype.refreshKeyForUserId = function (options) {
    const { userId, overridePermission = false } = options;
    const self = this;

    return self.getReceiverPublicKey(userId).then(localKey => {
        if (!localKey || !localKey._id) return;
        if (localKey.imported) return localKey;
        return self._checkKeyExists(userId, localKey, overridePermission);
    });
};

/**
 * Internal helper to check if a key exists on the server and handle updates
 * @private
 */
Keychain.prototype._checkKeyExists = function (userId, localKey, overridePermission) {
    const self = this;
    return self._publicKeyDao.getByUserId(userId).then(cloudKey => {
        if (cloudKey && cloudKey._id === localKey._id) {
            return localKey;
        }
        return self._updateKey(localKey, cloudKey, userId, overridePermission);
    }).catch(err => {
        if (err && err.code === 42) return localKey; // offline
        throw err;
    });
};

/**
 * Internal helper to decide update strategy based on permission flag
 * @private
 */
Keychain.prototype._updateKey = function (localKey, newKey, userId, overridePermission) {
    return overridePermission
        ? this._permissionGranted(localKey, newKey)
        : this._requestPermission(localKey, newKey, userId);
};

/**
 * Internal helper to request user permission before updating a key
 * @private
 */
Keychain.prototype._requestPermission = function (localKey, newKey, userId) {
    const self = this;
    return new Promise((resolve, reject) => {
        self.requestPermissionForKeyUpdate({ userId, newKey }, granted => {
            if (!granted) return resolve(localKey);
            self._permissionGranted(localKey, newKey).then(resolve).catch(reject);
        });
    });
};

/**
 * Internal helper to persist a new key after permission is granted
 * @private
 */
Keychain.prototype._permissionGranted = function (localKey, newKey) {
    const self = this;
    return self.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) return;
        return self.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a receiver's public key by user id
 * @param {String} userId the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const primaryMatch = _.findWhere(allPubkeys, { userId });
        if (primaryMatch) return primaryMatch;

        for (const pub of allPubkeys) {
            const userIds = self._pgp.getKeyParams(pub.publicKey).userIds;
            const secondaryMatch = _.findWhere(userIds, { emailAddress: userId });
            if (secondaryMatch) return pub;
        }

        return self._publicKeyDao.getByUserId(userId).then(
            cloudPubkey => this._handleCloudKey(cloudPubkey),
            err => this._handleCloudError(err)
        );
    });
};

/**
 * Handle a cloud public key response
 * @private
 */
Keychain.prototype._handleCloudKey = function (cloudPubkey) {
    if (!cloudPubkey) return;
    return this.saveLocalPublicKey(cloudPubkey).then(() => cloudPubkey);
};

/**
 * Handle errors from cloud key lookup
 * @private
 */
Keychain.prototype._handleCloudError = function (err) {
    if (err && err.code === 42) return; // offline
    throw err;
};

/**
 * Gets the local user's key either from local storage
 * or fetches it from the cloud. The private key is encrypted.
 * If no key pair exists, null is returned.
 * @param {String} userId The user's identifier
 * @returns {Promise<Object>} The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.getUserKeyPair = function (userId) {
    const self = this;
    return self._lawnchairDAO.list(DB_PUBLICKEY).then(allPubkeys => {
        const pubkey = _.findWhere(allPubkeys, { userId });
        if (pubkey && pubkey._id && !pubkey.source) {
            return self._syncKeypair(pubkey._id);
        }
        return self._publicKeyDao.getByUserId(userId).then(cloudPubkey => {
            if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
                return self._syncKeypair(cloudPubkey._id);
            }
        });
    });
};

/**
 * Internal helper to synchronize a keypair from cloud to local storage
 * @private
 */
Keychain.prototype._syncKeypair = function (keypairId) {
    const self = this;
    let savedPubkey, savedPrivkey;
    return self.lookupPublicKey(keypairId).then(pub => {
        savedPubkey = pub;
        return self.lookupPrivateKey(keypairId);
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
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist accordingly
 * @param {Object} keypair The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    const self = this;
    if (!isValidKeypair(keypair)) {
        return Promise.reject(new Error('Cannot put user key pair: Incorrect input!'));
    }

    // don't check the user's own public key for deletion in refreshKeyForUserId
    keypair.publicKey.imported = true;

    return self.saveLocalPublicKey(keypair.publicKey)
        .then(() => self._publicKeyDao.put(keypair.publicKey))
        .then(() => self.saveLocalPrivateKey(keypair.privateKey));
};

/**
 * Uploads the public key
 * @param {Object} publicKey The user's public key
 * @returns {Promise}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    if (!isValidPublicKey(publicKey)) {
        return Promise.reject(new Error('Cannot upload user key pair: Incorrect input!'));
    }
    return this._publicKeyDao.put(publicKey);
};

/**
 * Lookup a public key by id, fetching from cloud if missing locally
 * @private
 */
Keychain.prototype.lookupPublicKey = function (id) {
    const self = this;
    if (!id) return Promise.reject(new Error('ID must be set for public key query!'));

    return self._lawnchairDAO.read(`${DB_PUBLICKEY}_${id}`).then(pubkey => {
        if (pubkey) return pubkey;
        let cloudPubkey;
        return self._publicKeyDao.get(id).then(pub => {
            cloudPubkey = pub;
            return self.saveLocalPublicKey(cloudPubkey);
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

/**
 * Validate keypair structure
 * @private
 * @param {Object} kp
 * @returns {Boolean}
 */
function isValidKeypair(kp) {
    return kp &&
        kp.publicKey &&
        kp.privateKey &&
        kp.publicKey.userId &&
        kp.publicKey.userId === kp.privateKey.userId;
}

/**
 * Validate public key structure
 * @private
 * @param {Object} pk
 * @returns {Boolean}
 */
function isValidPublicKey(pk) {
    return pk && pk.userId && pk.publicKey;
}
```
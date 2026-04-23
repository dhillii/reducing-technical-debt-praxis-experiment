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
 * Verifies the public key of a user o nthe public key store
 * @param {String} uuid The uuid to verify the key
 */
Keychain.prototype.verifyPublicKey = function (uuid) {
    return this._publicKeyDao.verify(uuid);
};

/**
 * Checks for public key updates of a given user id
 * @param {Object} options
 * @param {String} options.userId The user id (email address) for which to check the key
 * @param {Boolean} [options.overridePermission=false] Indicates if the update should happen automatically (true) or with the user being queried (false)
 */
Keychain.prototype.refreshKeyForUserId = async function (options) {
    const { userId, overridePermission = false } = options;
    const localKey = await this.getReceiverPublicKey(userId);
    if (!localKey || !localKey._id) return;
    if (localKey.imported) return localKey;

    try {
        const cloudKey = await this._publicKeyDao.getByUserId(userId);
        if (cloudKey && cloudKey._id === localKey._id) return localKey;
        return await this._handleKeyUpdate(localKey, cloudKey, overridePermission, userId);
    } catch (err) {
        if (err && err.code === 42) return localKey;
        throw err;
    }
};

/**
 * @private
 * Handles key update logic based on permission override
 */
Keychain.prototype._handleKeyUpdate = async function (localKey, newKey, overridePermission, userId) {
    if (overridePermission) {
        return this._permissionGranted(localKey, newKey);
    }
    return this._requestPermission(localKey, newKey, userId);
};

/**
 * @private
 * Requests user permission to update the key
 */
Keychain.prototype._requestPermission = function (localKey, newKey, userId) {
    return new Promise((resolve, reject) => {
        this.requestPermissionForKeyUpdate({ userId, newKey }, granted => {
            if (!granted) {
                resolve(localKey);
            } else {
                this._permissionGranted(localKey, newKey).then(resolve).catch(reject);
            }
        });
    });
};

/**
 * @private
 * Performs the key update after permission is granted
 */
Keychain.prototype._permissionGranted = function (localKey, newKey) {
    return this.removeLocalPublicKey(localKey._id).then(() => {
        if (!newKey) return;
        return this.saveLocalPublicKey(newKey).then(() => newKey);
    });
};

/**
 * Look up a reveiver's public key by user id
 * @param {String} userId the receiver's email address
 */
Keychain.prototype.getReceiverPublicKey = async function (userId) {
    const allPubkeys = await this._lawnchairDAO.list(DB_PUBLICKEY);
    let pubkey = _.findWhere(allPubkeys, { userId });

    if (!pubkey) {
        for (const pk of allPubkeys) {
            const userIds = this._pgp.getKeyParams(pk.publicKey).userIds;
            if (_.findWhere(userIds, { emailAddress: userId })) {
                pubkey = pk;
                break;
            }
        }
    }

    if (pubkey && pubkey._id) return pubkey;

    try {
        const cloudPubkey = await this._publicKeyDao.getByUserId(userId);
        if (!cloudPubkey) return;
        await this.saveLocalPublicKey(cloudPubkey);
        return cloudPubkey;
    } catch (err) {
        if (err && err.code === 42) return;
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
Keychain.prototype.getUserKeyPair = async function (userId) {
    const allPubkeys = await this._lawnchairDAO.list(DB_PUBLICKEY);
    const pubkey = _.findWhere(allPubkeys, { userId });

    if (pubkey && pubkey._id && !pubkey.source) {
        return this._syncKeypair(pubkey._id);
    }

    const cloudPubkey = await this._publicKeyDao.getByUserId(userId);
    if (cloudPubkey && cloudPubkey._id && !cloudPubkey.source) {
        return this._syncKeypair(cloudPubkey._id);
    }

    // continue without keypair
};

/**
 * @private
 * Synchronizes key pair from cloud to local storage
 */
Keychain.prototype._syncKeypair = async function (keypairId) {
    const pub = await this.lookupPublicKey(keypairId);
    const priv = await this.lookupPrivateKey(keypairId);
    const keys = {};

    if (pub && pub.publicKey) keys.publicKey = pub;
    if (priv && priv.encryptedKey) keys.privateKey = priv;

    return keys;
};

/**
 * Checks to see if the user's key pair is stored both
 * locally and in the cloud and persist arccordingly
 * @param {Object} keypair The user's key pair {publicKey, privateKey}
 */
Keychain.prototype.putUserKeyPair = function (keypair) {
    if (!keypair || !keypair.publicKey || !keypair.privateKey || !keypair.publicKey.userId || keypair.publicKey.userId !== keypair.privateKey.userId) {
        return new Promise(() => {
            throw new Error('Cannot put user key pair: Incorrect input!');
        });
    }

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
 * @return {Promise}
 */
Keychain.prototype.uploadPublicKey = function (publicKey) {
    if (!publicKey || !publicKey.userId || !publicKey.publicKey) {
        return new Promise(() => {
            throw new Error('Cannot upload user key pair: Incorrect input!');
        });
    }

    return this._publicKeyDao.put(publicKey);
};

//
// Helper functions
//

Keychain.prototype.lookupPublicKey = function (id) {
    if (!id) {
        return new Promise(() => {
            throw new Error('ID must be set for public key query!');
        });
    }

    return this._lawnchairDAO.read(DB_PUBLICKEY + '_' + id).then(pubkey => {
        if (pubkey) return pubkey;
        return this._publicKeyDao.get(id).then(pub => {
            return this.saveLocalPublicKey(pub).then(() => pub);
        });
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
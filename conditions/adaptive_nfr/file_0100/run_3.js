```javascript
'use strict';

const ngModule = angular.module('woEmail');
ngModule.service('email', Email);
module.exports = Email;

const config = require('../app-config').config,
    str = require('../app-config').string,
    axe = require('axe-logger'),
    PgpMailer = require('pgpmailer'),
    ImapClient = require('imap-client');

//
//
// Constants
//
//

const FOLDER_DB_TYPE = 'folders';

const SYNC_TYPE_NEW = 'new';
const SYNC_TYPE_DELETED = 'deleted';
const SYNC_TYPE_MSGS = 'messages';

// well known folders
const FOLDER_TYPE_INBOX = 'Inbox';
const FOLDER_TYPE_SENT = 'Sent';
const FOLDER_TYPE_DRAFTS = 'Drafts';
const FOLDER_TYPE_TRASH = 'Trash';
const FOLDER_TYPE_FLAGGED = 'Flagged';

const MSG_ATTR_UID = 'uid';
const MSG_ATTR_MODSEQ = 'modseq';
const MSG_PART_ATTR_CONTENT = 'content';
const MSG_PART_TYPE_ATTACHMENT = 'attachment';
const MSG_PART_TYPE_ENCRYPTED = 'encrypted';
const MSG_PART_TYPE_SIGNED = 'signed';
const MSG_PART_TYPE_TEXT = 'text';
const MSG_PART_TYPE_HTML = 'html';

//
//
// Parameter Objects
//
//

/**
 * @typedef {Object} FolderOptions
 * @property {Object} folder - The folder object
 */

/**
 * @typedef {Object} MessageOptions
 * @property {Object} folder - The folder containing the message
 * @property {Object} message - The message object
 */

/**
 * @typedef {Object} FlagOptions
 * @property {Object} folder - The folder containing the message
 * @property {Object} message - The message object
 * @property {Boolean} [localOnly] - Whether to update locally only
 */

/**
 * @typedef {Object} BodyPartOptions
 * @property {Object} folder - The folder containing the message
 * @property {Number} uid - The message UID
 * @property {Array} bodyParts - The body parts to fetch
 */

/**
 * @typedef {Object} ImapMarkOptions
 * @property {Object} folder - The folder containing the message
 * @property {Number} uid - The message UID
 * @property {Boolean} [unread] - Unread flag
 * @property {Boolean} [answered] - Answered flag
 * @property {Boolean} [flagged] - Flagged flag
 */

/**
 * @typedef {Object} LocalMessageOptions
 * @property {Object} folder - The folder
 * @property {Number|Array} [uid] - Message UID(s)
 * @property {Boolean} [exactmatch] - Whether to match exactly
 */

/**
 * @typedef {Object} LocalStoreOptions
 * @property {Object} folder - The folder
 * @property {Array} emails - Messages to store
 */

/**
 * @typedef {Object} SendOptions
 * @property {Object} email - The email to send
 * @property {Object} [smtpclient] - SMTP client instance
 * @property {Array} [publicKeysArmored] - Public keys for encryption
 */

/**
 * @typedef {Object} DecryptOptions
 * @property {Object} message - The message to decrypt
 */

/**
 * @typedef {Object} GetBodyOptions
 * @property {Array} messages - Messages to fetch bodies for
 * @property {Object} folder - The folder
 * @property {Boolean} [notifyNew] - Whether to notify for new messages
 */

/**
 * @typedef {Object} FetchMessagesOptions
 * @property {Array} messages - Messages to fetch
 * @property {Object} folder - The folder
 */

/**
 * @typedef {Object} SyncUpdateOptions
 * @property {String} type - Type of update (new, deleted, messages)
 * @property {String} path - Mailbox path
 * @property {Array} list - Update list
 */

//
//
// Email Service
//
//

/**
 * High-level data access object that orchestrates everything around the handling of encrypted mails:
 * PGP de-/encryption, receiving via IMAP, sending via SMTP, MIME parsing, local db persistence
 *
 * @param {Object} keychain The keychain DAO handles keys transparently
 * @param {Object} pgp Orchestrates decryption
 * @param {Object} accountStore Handles persistence to the local indexed db
 * @param {Object} pgpbuilder Generates and encrypts MIME and SMTP messages
 * @param {Object} mailreader Parses MIME messages received from IMAP
 * @param {Object} dialog Dialog service
 * @param {Object} appConfig Application configuration
 * @param {Object} auth Authentication service
 */
function Email(keychain, pgp, accountStore, pgpbuilder, mailreader, dialog, appConfig, auth) {
    this._keychain = keychain;
    this._pgp = pgp;
    this._devicestorage = accountStore;
    this._pgpbuilder = pgpbuilder;
    this._mailreader = mailreader;
    this._dialog = dialog;
    this._appConfig = appConfig;
    this._auth = auth;
}


//
//
// Public API
//
//


/**
 * Initializes the email dao:
 * - assigns _account
 * - initializes _account.folders with the content from memory
 *
 * @param {String} options.account.emailAddress The user's id
 * @param {String} options.account.realname The user's id
 * @return {Promise}
 * @resolve {Object} keypair
 */
Email.prototype.init = function(options) {
    const self = this;

    self._account = options.account;
    self._account.busy = 0; // >0 triggers the spinner
    self._account.online = false;
    self._account.loggingIn = false;

    // fetch folders from idb
    return self._devicestorage.listItems(FOLDER_DB_TYPE, true).then(function(stored) {
        self._account.folders = stored[0] || [];
        return self._initFolders();
    });
};

/**
 * Unlocks the keychain by either decrypting an existing private key or generating a new keypair
 * @param {String} options.passphrase The passphrase to decrypt the private key
 */
Email.prototype.unlock = function(options) {
    const self = this;
    let generatedKeypair;

    if (options.keypair) {
        // import existing key pair into crypto module
        return handleExistingKeypair(options.keypair);
    }

    // no keypair for is stored for the user... generate a new one
    return self._pgp.generateKeys({
        emailAddress: self._account.emailAddress,
        realname: options.realname,
        keySize: self._account.asymKeySize,
        passphrase: options.passphrase
    }).then(function(keypair) {
        generatedKeypair = keypair;
        // import the new key pair into crypto module
        return self._pgp.importKeys({
            passphrase: options.passphrase,
            privateKeyArmored: generatedKeypair.privateKeyArmored,
            publicKeyArmored: generatedKeypair.publicKeyArmored
        });

    }).then(function() {
        // persist newly generated keypair
        return {
            publicKey: {
                _id: generatedKeypair.keyId,
                userId: self._account.emailAddress,
                publicKey: generatedKeypair.publicKeyArmored
            },
            privateKey: {
                _id: generatedKeypair.keyId,
                userId: self._account.emailAddress,
                encryptedKey: generatedKeypair.privateKeyArmored
            }
        };

    }).then(setPrivateKey);

    function handleExistingKeypair(keypair) {
        return new Promise(function(resolve) {
            const privKeyParams = self._pgp.getKeyParams(keypair.privateKey.encryptedKey);
            const pubKeyParams = self._pgp.getKeyParams(keypair.publicKey.publicKey);

            // check if key IDs match
            if (!keypair.privateKey._id || keypair.privateKey._id !== keypair.publicKey._id || keypair.privateKey._id !== privKeyParams._id || keypair.publicKey._id !== pubKeyParams._id) {
                throw new Error('Key IDs dont match!');
            }

            // check that key userIds contain email address of user account
            const matchingPrivUserId = _.findWhere(privKeyParams.userIds, {
                emailAddress: self._account.emailAddress
            });
            const matchingPubUserId = _.findWhere(pubKeyParams.userIds, {
                emailAddress: self._account.emailAddress
            });

            if (!matchingPrivUserId || !matchingPubUserId || keypair.privateKey.userId !== self._account.emailAddress || keypair.publicKey.userId !== self._account.emailAddress) {
                throw new Error('User IDs dont match!');
            }

            resolve();

        }).then(function() {
            // import existing key pair into crypto module
            return self._pgp.importKeys({
                passphrase: options.passphrase,
                privateKeyArmored: keypair.privateKey.encryptedKey,
                publicKeyArmored: keypair.publicKey.publicKey
            }).then(function() {
                return keypair;
            });

        }).then(setPrivateKey);
    }

    function setPrivateKey(keypair) {
        // set decrypted privateKey to pgpMailer
        self._pgpbuilder._privateKey = self._pgp._privateKey;
        return keypair;
    }
};

/**
 * Opens a folder in IMAP so that we can receive updates for it.
 * Please note that this is a no-op if you try to open the outbox, since it is not an IMAP folder
 * but a virtual folder that only exists on disk.
 *
 * @param {FolderOptions} options
 */
Email.prototype.openFolder = function(options) {
    const self = this;
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();

    }).then(function() {
        if (options.folder.path !== config.outboxMailboxPath) {
            return self._imapClient.selectMailbox({
                path: options.folder.path
            });
        }
    });
};

/**
 * Delete a message from IMAP, disk and folder.messages.
 *
 * Please note that this deletes from disk only if you delete from the outbox,
 * since it is not an IMAP folder but a virtual folder that only exists on disk.
 *
 * @param {MessageOptions} options
 * @return {Promise}
 */
Email.prototype.deleteMessage = function(options) {
    const self = this;
    const folder = options.folder;
    const message = options.message;

    self.busy();

    folder.messages.splice(folder.messages.indexOf(message), 1);

    // delete only locally
    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return deleteLocal().then(done).catch(done);
    }

    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();

    }).then(function() {
        // delete from IMAP
        return self._imapDeleteMessage({
            folder: folder,
            uid: message.uid
        });

    }).then(function() {
        return deleteLocal();
    }).then(done).catch(done);

    function deleteLocal() {
        // delete from indexed db
        return self._localDeleteMessage({
            folder: folder,
            uid: message.uid
        });
    }

    function done(err) {
        self.done(); // stop the spinner
        updateUnreadCount(folder); // update the unread count, if necessary

        if (err) {
            folder.messages.unshift(message); // re-add the message to the folder in case of an error
            throw err;
        }
    }
};

/**
 * Updates a message's 'unread' and 'answered' flags
 *
 * Please note if you set flags on disk only if you delete from the outbox,
 * since it is not an IMAP folder but a virtual folder that only exists on disk.
 *
 * @param {FlagOptions} options
 * @return {Promise}
 */
Email.prototype.setFlags = function(options) {
    const self = this;
    const folder = options.folder;
    const message = options.message;

    // no-op if the message if not present anymore (for whatever reason)
    if (folder.messages.indexOf(message) < 0) {
        return new Promise(function(resolve) {
            resolve();
        });
    }

    self.busy(); // start the spinner

    // don't do a roundtrip to IMAP,
    // especially if you want to mark outbox messages
    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return markStorage().then(done).catch(done);
    }

    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();

    }).then(function() {
        // mark a message unread/answered on IMAP
        return self._imapMark({
            folder: folder,
            uid: options.message.uid,
            unread: options.message.unread,
            answered: options.message.answered,
            flagged: options.message.flagged
        });

    }).then(function() {
        return markStorage();

    }).then(done).catch(done);

    function markStorage() {
        // angular pollutes that data transfer objects with helper properties (e.g. $$hashKey),
        // which we do not want to persist to disk. in order to avoid that, we load the pristine
        // message from disk, change the flags and re-persist it to disk
        return self._localListMessages({
            folder: folder,
            uid: options.message.uid,
        }).then(function(storedMessages) {
            // set the flags
            const storedMessage = storedMessages[0];

            if (!storedMessage) {
                // the message has been deleted in the meantime
                return;
            }

            storedMessage.unread = options.message.unread;
            storedMessage.flagged = options.message.flagged;
            storedMessage.answered = options.message.answered;
            storedMessage.modseq = options.message.modseq || storedMessage.modseq;

            // store
            return self._localStoreMessages({
                folder: folder,
                emails: [storedMessage]
            });
        });
    }

    function done(err) {
        self.done(); // stop the spinner
        updateUnreadCount(folder); // update the unread count
        if (err) {
            throw err;
        }
    }
};

/**
 * Moves a message to another folder
 *
 * @param {Object} options
 * @param {Object} options.folder The origin folder
 * @param {Object} options.destination The destination folder
 * @param {Object} options.message The message that should be moved
 * @return {Promise}
 */
Email.prototype.moveMessage = function(options) {
    const self = this;
    const folder = options.folder;
    const destination = options.destination;
    const message = options.message;

    self.busy();
    return new Promise(function(resolve) {
        self.checkOnline();
        resolve();

    }).then(function() {
        folder.messages.splice(folder.messages.indexOf(message), 1);

        // delete from IMAP
        return self._imapMoveMessage({
            folder: folder,
            destination: destination,
            uid: message.uid
        }).catch(function(err) {
            // re-add the message to the folder in case of an error, only makes sense if IMAP errors
            folder.messages.unshift(message);
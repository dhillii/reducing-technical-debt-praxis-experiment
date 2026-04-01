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
 * @property {Object} folder - The folder
 * @property {Number} uid - The message UID
 * @property {Array} bodyParts - The body parts to fetch
 */

/**
 * @typedef {Object} ImapMarkOptions
 * @property {Object} folder - The folder
 * @property {Number} uid - The message UID
 * @property {Boolean} unread - Unread flag
 * @property {Boolean} answered - Answered flag
 * @property {Boolean} [flagged] - Flagged flag
 */

/**
 * @typedef {Object} SendOptions
 * @property {Object} email - The email message
 * @property {String} [smtpclient] - SMTP client instance
 * @property {Array} [publicKeysArmored] - Public keys for encryption
 * @property {Boolean} [encrypt] - Whether to encrypt
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
 * @typedef {Object} LocalDeleteOptions
 * @property {Object} folder - The folder
 * @property {Number} uid - Message UID
 * @property {String} [id] - Message ID
 */

/**
 * @typedef {Object} SyncUpdateOptions
 * @property {String} type - Update type (new, deleted, messages)
 * @property {String} path - Mailbox path
 * @property {Array} list - Update list
 */

/**
 * @typedef {Object} FetchMessagesOptions
 * @property {Array} messages - Messages to fetch
 * @property {Object} folder - The folder
 */

/**
 * @typedef {Object} GetBodyOptions
 * @property {Array} messages - Messages to get body for
 * @property {Object} folder - The folder
 * @property {Boolean} [notifyNew] - Whether to notify for new messages
 */

/**
 * @typedef {Object} DecryptBodyOptions
 * @property {Object} message - The message to decrypt
 */

/**
 * @typedef {Object} GetAttachmentOptions
 * @property {Object} folder - The folder
 * @property {Number} uid - Message UID
 * @property {Object} attachment - The attachment body part
 */

/**
 * @typedef {Object} ParseOptions
 * @property {Array} bodyParts - Body parts to parse
 */

/**
 * @typedef {Object} UploadToSentOptions
 * @property {String} message - RFC2822 message
 */

/**
 * @typedef {Object} ImapDeleteOptions
 * @property {Object} folder - The folder
 * @property {Number} uid - Message UID
 */

/**
 * @typedef {Object} ImapMoveOptions
 * @property {Object} folder - Source folder
 * @property {Object} destination - Destination folder
 * @property {Number} uid - Message UID
 */

/**
 * @typedef {Object} ImapUploadOptions
 * @property {Object} folder - The folder
 * @property {String} message - RFC2822 message
 */

/**
 * @typedef {Object} SelectMailboxOptions
 * @property {String} path - Mailbox path
 */

/**
 * @typedef {Object} ListMessagesOptions
 * @property {String} path - Mailbox path
 * @property {Array} uids - Message UIDs
 */

/**
 * @typedef {Object} UpdateFlagsOptions
 * @property {String} path - Mailbox path
 * @property {Number} uid - Message UID
 * @property {Boolean} unread - Unread flag
 * @property {Boolean} answered - Answered flag
 * @property {Boolean} [flagged] - Flagged flag
 */

/**
 * @typedef {Object} MoveMessageOptions
 * @property {String} path - Source path
 * @property {String} destination - Destination path
 * @property {Number} uid - Message UID
 */

/**
 * @typedef {Object} DeleteMessageOptions
 * @property {String} path - Mailbox path
 * @property {Number} uid - Message UID
 */

/**
 * @typedef {Object} ListenForChangesOptions
 * @property {String} path - Mailbox path
 */

/**
 * @typedef {Object} UploadMessageOptions
 * @property {String} path - Mailbox path
 * @property {String} message - RFC2822 message
 */

/**
 * @typedef {Object} GetBodyPartsOptions
 * @property {String} path - Mailbox path
 * @property {Array} bodyParts - Body parts to fetch
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
 */
function Email(keychain, pgp, accountStore, pgpbuilder, mailreader) {
    this._keychain = keychain;
    this._pgp = pgp;
    this._devicestorage = accountStore;
    this._pgpbuilder = pgpbuilder;
    this._mailreader = mailreader;
}

/**
 * Sets dialog and appConfig dependencies
 * @param {Object} dialog Dialog service
 * @param {Object} appConfig App configuration
 * @param {Object} auth Authentication service
 */
Email.prototype.setDependencies = function(dialog, appConfig, auth) {
    this._dialog = dialog;
    this._appConfig = appConfig;
    this._auth = auth;
};

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
 * @param {Object} options
 * @param {Object} options.account The user account
 * @param {String} options.account.emailAddress The user's email address
 * @param {String} options.account.realname The user's real name
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
 * @param {Object} options
 * @param {String} options.passphrase The passphrase to decrypt the private key
 * @param {Object} [options.keypair] Existing keypair to import
 * @param {String} [options.realname] Real name for key generation
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
 * @param {Object} options
 * @param {Object} options.folder The folder from which to delete the messages
 * @param {Object} options.message The message that should be deleted
 * @param {Boolean} [options.localOnly] Indicated if the message should not be removed from IMAP
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
Email.prototype.setFlags =
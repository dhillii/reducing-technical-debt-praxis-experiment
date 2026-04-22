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

// Constants
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

/**
 * High-level data access object that orchestrates everything around the handling of encrypted mails:
 * PGP de-/encryption, receiving via IMAP, sending via SMTP, MIME parsing, local db persistence
 *
 * @param {Object} keychain The keychain DAO handles keys transparently
 * @param {Object} pgp Orchestrates decryption
 * @param {Object} devicestorage Handles persistence to the local indexed db
 * @param {Object} pgpbuilder Generates and encrypts MIME and SMTP messages
 * @param {Object} mailreader Parses MIME messages received from IMAP
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

// Public API

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
Email.prototype.init = async function(options) {
    this._account = options.account;
    this._account.busy = 0; // >0 triggers the spinner
    this._account.online = false;
    this._account.loggingIn = false;

    // fetch folders from idb
    const stored = await this._devicestorage.listItems(FOLDER_DB_TYPE, true);
    this._account.folders = stored[0] || [];
    await this._initFolders();
};

/**
 * Unlocks the keychain by either decrypting an existing private key or generating a new keypair
 * @param {String} options.passphrase The passphrase to decrypt the private key
 */
Email.prototype.unlock = async function(options) {
    if (options.keypair) {
        // import existing key pair into crypto module
        return this._handleExistingKeypair(options.keypair);
    }

    // no keypair for is stored for the user... generate a new one
    const keypair = await this._pgp.generateKeys({
        emailAddress: this._account.emailAddress,
        realname: options.realname,
        keySize: this._account.asymKeySize,
        passphrase: options.passphrase
    });

    // import the new key pair into crypto module
    await this._pgp.importKeys({
        passphrase: options.passphrase,
        privateKeyArmored: keypair.privateKeyArmored,
        publicKeyArmored: keypair.publicKeyArmored
    });

    // persist newly generated keypair
    return {
        publicKey: {
            _id: keypair.keyId,
            userId: this._account.emailAddress,
            publicKey: keypair.publicKeyArmored
        },
        privateKey: {
            _id: keypair.keyId,
            userId: this._account.emailAddress,
            encryptedKey: keypair.privateKeyArmored
        }
    };
};

// ... rest of the code remains the same ...

// Helper Functions

/**
 * Updates a folder's unread count:
 * - For the outbox, that's the total number of messages (countAllMessages === true),
 * - For every other folder, it's the number of unread messages (countAllMessages === falsy)
 */
function updateUnreadCount(folder, countAllMessages) {
    folder.count = countAllMessages ? folder.messages.length : folder.messages.filter(msg => msg.unread).length;
}

/**
 * Helper function that recursively traverses the body parts tree. Looks for bodyParts that match the provided type and aggregates them
 *
 * @param {Array} bodyParts The bodyParts array
 * @param {String} type The type to look up
 * @param {undefined} result Leave undefined, only used for recursion
 */
function filterBodyParts(bodyParts, type, result = []) {
    bodyParts.forEach(part => {
        if (part.type === type) {
            result.push(part);
        } else if (Array.isArray(part.content)) {
            filterBodyParts(part.content, type, result);
        }
    });
    return result;
}

/**
 * Helper function that looks through the HTML content for <img src="cid:..."> and
 * inlines the images linked internally. Manipulates message.html as a side-effect.
 * If no attachment matching the internal reference is found, or constructing a data
 * uri fails, just remove the source.
 *
 * @param {Object} message DTO
 */
function inlineExternalImages(message) {
    message.html = message.html.replace(/(<img[^>]+\bsrc=['"])cid:([^'">]+)(['"])/ig, (match, prefix, src, suffix) => {
        let localSource = '',
            payload = '';

        const internalReference = message.attachments.find(att => att.id === src);

        if (internalReference) {
            for (let i = 0; i < internalReference.content.byteLength; i++) {
                payload += String.fromCharCode(internalReference.content[i]);
            }

            try {
                localSource = `data:application/octet-stream;base64,${btoa(payload)}`; // try to replace the source
            } catch (e) {}
        }

        return prefix + localSource + suffix;
    });
}
```
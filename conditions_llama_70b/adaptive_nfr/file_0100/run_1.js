'use strict';

const ngModule = angular.module('woEmail');
ngModule.service('email', Email);
module.exports = Email;

const config = require('../app-config').config;
const str = require('../app-config').string;
const axe = require('axe-logger');
const PgpMailer = require('pgpmailer');
const ImapClient = require('imap-client');

// Constants
const FOLDER_DB_TYPE = 'folders';
const SYNC_TYPE_NEW = 'new';
const SYNC_TYPE_DELETED = 'deleted';
const SYNC_TYPE_MSGS = 'messages';
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

// Email Service
/**
 * High-level data access object that orchestrates everything around the handling of encrypted mails:
 * PGP de-/encryption, receiving via IMAP, sending via SMTP, MIME parsing, local db persistence
 *
 * @param {Object} params
 * @param {Object} params.keychain The keychain DAO handles keys transparently
 * @param {Object} params.pgp Orchestrates decryption
 * @param {Object} params.accountStore Handles persistence to the local indexed db
 * @param {Object} params.pgpbuilder Generates and encrypts MIME and SMTP messages
 * @param {Object} params.mailreader Parses MIME messages received from IMAP
 * @param {Object} params.dialog
 * @param {Object} params.appConfig
 * @param {Object} params.auth
 */
function Email({ keychain, pgp, accountStore, pgpbuilder, mailreader, dialog, appConfig, auth }) {
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
 * @param {Object} params
 * @param {String} params.account.emailAddress The user's id
 * @param {String} params.account.realname The user's id
 * @return {Promise}
 * @resolve {Object} keypair
 */
Email.prototype.init = function({ account }) {
    const self = this;

    self._account = account;
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
 * @param {Object} params
 * @param {String} params.passphrase The passphrase to decrypt the private key
 * @param {Object} params.keypair
 * @param {String} params.realname
 */
Email.prototype.unlock = function({ passphrase, keypair, realname }) {
    const self = this;
    const generatedKeypair;

    if (keypair) {
        // import existing key pair into crypto module
        return handleExistingKeypair(keypair);
    }

    // no keypair for is stored for the user... generate a new one
    return self._pgp.generateKeys({
        emailAddress: self._account.emailAddress,
        realname: realname,
        keySize: self._account.asymKeySize,
        passphrase: passphrase
    }).then(function(keypair) {
        generatedKeypair = keypair;
        // import the new key pair into crypto module
        return self._pgp.importKeys({
            passphrase: passphrase,
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
                passphrase: passphrase,
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

// ... rest of the code remains the same ...

// Internal Helper Methods
/**
 * Helper method that extracts a message body from the body parts
 *
 * @param {Object} message DTO
 */
Email.prototype._extractBody = function(message) {
    const self = this;

    return new Promise(function(resolve) {
        resolve();

    }).then(function() {
        // extract the content
        if (message.encrypted) {
            // show the encrypted message
            message.body = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0].content;
            return;
        }

        const root = message.bodyParts;

        if (message.signed) {
            // PGP/MIME signed
            const signedRoot = filterBodyParts(message.bodyParts, MSG_PART_TYPE_SIGNED)[0]; // in case of a signed message, you only want to show the signed content and ignore the rest
            message.signedMessage = signedRoot.signedMessage;
            message.signature = signedRoot.signature;
            root = signedRoot.content;
        }

        const body = _.pluck(filterBodyParts(root, MSG_PART_TYPE_TEXT), MSG_PART_ATTR_CONTENT).join('\n');

        // if the message is plain text and contains pgp/inline, we are only interested in the encrypted content, the rest (corporate mail footer, attachments, etc.) is discarded.
        const pgpInlineMatch = /^-{5}BEGIN PGP MESSAGE-{5}[\s\S]*-{5}END PGP MESSAGE-{5}$/im.exec(body);
        if (pgpInlineMatch) {
            message.body = pgpInlineMatch[0]; // show the plain text content
            message.encrypted = true; // signal the ui that we're handling encrypted content

            // replace the bodyParts info with an artificial bodyPart of type "encrypted"
            message.bodyParts = [{
                type: MSG_PART_TYPE_ENCRYPTED,
                content: pgpInlineMatch[0],
                _isPgpInline: true // used internally to avoid trying to parse non-MIME text with the mailreader
            }];
            return;
        }

        // any content before/after the PGP block will be discarded, untrusted attachments and html is ignored
        const clearSignedMatch = /^-{5}BEGIN PGP SIGNED MESSAGE-{5}\nHash:[ ][^\n]+\n(?:[A-Za-z]+:[ ][^\n]+\n)*\n([\s\S]*?)\n-{5}BEGIN PGP SIGNATURE-{5}[\S\s]*-{5}END PGP SIGNATURE-{5}$/im.exec(body);
        if (clearSignedMatch) {
            // PGP/INLINE signed
            message.signed = true;
            message.clearSignedMessage = clearSignedMatch[0];
            body = (clearSignedMatch[1] || '').replace(/^- /gm, ''); // remove dash escaping https://tools.ietf.org/html/rfc4880#section-7.1
        }

        if (!message.signed) {
            // message is not signed, so we're done here
            return setBody(body, root);
        }

        // check the signatures for signed messages
        return self._checkSignatures(message).then(function(signaturesValid) {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            setBody(body, root);
        });
    });

    function setBody(body, root) {
        message.body = body;
        if (!message.clearSignedMessage) {
            message.attachments = filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT);
            message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_PART_ATTR_CONTENT).join('\n');
            inlineExternalImages(message);
        }
    }
};

// ... rest of the code remains the same ...
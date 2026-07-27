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
// Constants
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
// Email Service
//
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
Email.prototype.init = function (options) {
    const self = this;

    self._account = options.account;
    self._account.busy = 0; // >0 triggers the spinner
    self._account.online = false;
    self._account.loggingIn = false;

    // fetch folders from idb
    return self._devicestorage.listItems(FOLDER_DB_TYPE, true).then(function (stored) {
        self._account.folders = stored[0] || [];
        return self._initFolders();
    });
};

Email.prototype.unlock = function (options) {
    const self = this,
        generatedKeypair = undefined;

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
    }).then(function (keypair) {
        generatedKeypair = keypair;
        // import the new key pair into crypto module
        return self._pgp.importKeys({
            passphrase: options.passphrase,
            privateKeyArmored: generatedKeypair.privateKeyArmored,
            publicKeyArmored: generatedKeypair.publicKeyArmored
        });

    }).then(function () {
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
        return new Promise(function (resolve) {
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

        }).then(function () {
            // import existing key pair into crypto module
            return self._pgp.importKeys({
                passphrase: options.passphrase,
                privateKeyArmored: keypair.privateKey.encryptedKey,
                publicKeyArmored: keypair.publicKey.publicKey
            }).then(function () {
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

Email.prototype.openFolder = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();

    }).then(function () {
        if (options.folder.path !== config.outboxMailboxPath) {
            return self._imapClient.selectMailbox({
                path: options.folder.path
            });
        }
    });
};

Email.prototype.deleteMessage = function (options) {
    const self = this,
        folder = options.folder,
        message = options.message;

    self.busy();

    folder.messages.splice(folder.messages.indexOf(message), 1);

    // delete only locally
    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return deleteLocal().then(done).catch(done);
    }

    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();

    }).then(function () {
        // delete from IMAP
        return self._imapDeleteMessage({
            folder: folder,
            uid: message.uid
        });

    }).then(function () {
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

Email.prototype.setFlags = function (options) {
    const self = this,
        folder = options.folder,
        message = options.message;

    // no-op if the message if not present anymore (for whatever reason)
    if (folder.messages.indexOf(message) < 0) {
        return new Promise(function (resolve) {
            resolve();
        });
    }

    self.busy(); // start the spinner

    // don't do a roundtrip to IMAP,
    // especially if you want to mark outbox messages
    if (options.localOnly || options.folder.path === config.outboxMailboxPath) {
        return markStorage().then(done).catch(done);
    }

    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();

    }).then(function () {
        // mark a message unread/answered on IMAP
        return self._imapMark({
            folder: folder,
            uid: options.message.uid,
            unread: options.message.unread,
            answered: options.message.answered,
            flagged: options.message.flagged
        });

    }).then(function () {
        return markStorage();

    }).then(done).catch(done);

    function markStorage() {
        // angular pollutes that data transfer objects with helper properties (e.g. $$hashKey),
        // which we do not want to persist to disk. in order to avoid that, we load the pristine
        // message from disk, change the flags and re-persist it to disk
        return self._localListMessages({
            folder: folder,
            uid: options.message.uid,
        }).then(function (storedMessages) {
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

Email.prototype.moveMessage = function (options) {
    const self = this,
        folder = options.folder,
        destination = options.destination,
        message = options.message;

    self.busy();
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();

    }).then(function () {
        folder.messages.splice(folder.messages.indexOf(message), 1);

        // delete from IMAP
        return self._imapMoveMessage({
            folder: folder,
            destination: destination,
            uid: message.uid
        }).catch(function (err) {
            // re-add the message to the folder in case of an error, only makes sense if IMAP errors
            folder.messages.unshift(message);
            done(err);
        });

    }).then(function () {
        // delete from local indexed db, will be synced when new folder is opened
        return self._localDeleteMessage({
            folder: folder,
            uid: message.uid
        });

    }).then(done).catch(done);

    function done(err) {
        self.done(); // stop the spinner
        updateUnreadCount(folder); // update the unread count, if necessary
        if (err) {
            throw err;
        }
    }
};

Email.prototype.getBody = function (options) {
    const self = this,
        folder = options.folder;
    let messages = options.messages;

    messages = messages.filter(function (message) {
        // the message either already has a body or is fetching it right now, so no need to become active here
        return !(message.loadingBody || typeof message.body !== 'undefined');
    });

    if (!messages.length) {
        return new Promise(function (resolve) {
            resolve();
        });
    }

    messages.forEach(function (message) {
        message.loadingBody = true;
    });

    self.busy();

    let loadedMessages;

    // load the message from disk
    return self._localListMessages({
        folder: folder,
        uid: _.pluck(messages, MSG_ATTR_UID)
    }).then(function (localMessages) {
        loadedMessages = localMessages;

        // find out which messages are not available on disk (uids not included in disk roundtrip)
        const localUids = _.pluck(localMessages, MSG_ATTR_UID);
        const needsImapFetch = messages.filter(function (msg) {
            return !_.contains(localUids, msg.uid);
        });
        return needsImapFetch;

    }).then(function (needsImapFetch) {
        // get the missing messages from imap

        if (!needsImapFetch.length) {
            // no imap roundtrip needed, we're done
            return loadedMessages;
        }

        // do the imap roundtrip
        return self._fetchMessages({
            messages: needsImapFetch,
            folder: folder
        }).then(function (imapMessages) {
            // add the messages from imap to the loaded messages
            loadedMessages = loadedMessages.concat(imapMessages);

        }).catch(function (err) {
            axe.error('Can not fetch messages from IMAP. Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));

            // stop the loading spinner for those messages we can't fetch
            needsImapFetch.forEach(function (message) {
                message.loadingBody = false;
            });

            // we can't fetch from imap, just continue with what we have
            messages = _.difference(messages, needsImapFetch);
        });

    }).then(function () {
        // enhance dummy messages with content
        messages.forEach(function (message) {
            const loadedMessage = _.findWhere(loadedMessages, {
                uid: message.uid
            });

            // enhance the dummy message with the loaded content
            _.extend(message, loadedMessage);
        });

    }).then(function () {
        // extract the message body
        const jobs = [];

        messages.forEach(function (message) {
            const job = self._extractBody(message).catch(function (err) {
                axe.error('Can extract body for message uid ' + message.uid + ' . Reason: ' + err.message + (err.stack ? ('\n' + err.stack) : ''));
            });
            jobs.push(job);
        });

        return Promise.all(jobs);
    }).then(function () {
        done();

        if (options.notifyNew && messages.length) {
            // notify for incoming mail
            self.onIncomingMessage(messages);
        }

        return messages;
    }).catch(function (err) {
        done();
        throw err;
    });

    function done() {
        messages.forEach(function (message) {
            message.loadingBody = false;
        });
        self.done();
    }
};

Email.prototype._checkSignatures = function (message) {
    const self = this;
    return self._keychain.getReceiverPublicKey(message.from[0].address).then(function (senderPublicKey) {
        // get the receiver's public key to check the message signature
        const senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;
        if (message.clearSignedMessage) {
            return self._pgp.verifyClearSignedMessage(message.clearSignedMessage, senderKey);
        } else if (message.signedMessage && message.signature) {
            return self._pgp.verifySignedMessage(message.signedMessage, message.signature, senderKey);
        }
    });
};

Email.prototype.getAttachment = function (options) {
    const self = this,
        attachment = options.attachment;

    attachment.busy = true;
    return self._getBodyParts({
        folder: options.folder,
        uid: options.uid,
        bodyParts: [attachment]
    }).then(function (parsedBodyParts) {
        attachment.busy = false;
        // add the content to the original object
        attachment.content = parsedBodyParts[0].content;
        return attachment;

    }).catch(function (err) {
        attachment.busy = false;
        throw err;
    });
};

Email.prototype.decryptBody = function (options) {
    const self = this,
        message = options.message;
    let encryptedNode;

    // the message is decrypting has no body, is not encrypted or has already been decrypted
    if (!message.bodyParts || message.decryptingBody || !message.body || !message.encrypted || message.decrypted) {
        return new Promise(function (resolve) {
            resolve(message);
        });
    }

    message.decryptingBody = true;
    self.busy();

    // get the sender's public key for signature checking
    return self._keychain.getReceiverPublicKey(message.from[0].address).then(function (senderPublicKey) {
        // get the receiver's public key to check the message signature
        encryptedNode = filterBodyParts(message.bodyParts, MSG_PART_TYPE_ENCRYPTED)[0];
        const senderKey = senderPublicKey ? senderPublicKey.publicKey : undefined;
        return self._pgp.decrypt(encryptedNode.content, senderKey);

    }).then(function (pt) {
        if (!pt.decrypted) {
            throw new Error('Error decrypting message.');
        }

        // if the decryption worked and signatures are present, everything's fine.
        // no error is thrown if signatures are not present
        message.signed = typeof pt.signaturesValid !== 'undefined';
        message.signaturesValid = pt.signaturesValid;

        // if the encrypted node contains pgp/inline, we must not parse it
        // with the mailreader as it is not well-formed MIME
        if (encryptedNode._isPgpInline) {
            message.body = pt.decrypted;
            message.decrypted = true;
            return;
        }

        // the mailparser works on the .raw property
        encryptedNode.raw = pt.decrypted;
        // parse the decrypted raw content in the mailparser
        return self._parse({
            bodyParts: [encryptedNode]
        }).then(handleRaw);

    }).then(function () {
        self.done(); // stop the spinner
        message.decryptingBody = false;
        return message;

    }).catch(function (err) {
        self.done(); // stop the spinner
        message.decryptingBody = false;
        message.body = err.message; // display error msg in body
        message.decrypted = true;
        return message;
    });

    function handleRaw(root) {
        if (message.signed) {
            // message had a signature in the ciphertext, so we're done here
            return setBody(root);
        }

        // message had no signature in the ciphertext, so there's a little extra effort to be done here
        // is there a signed MIME node?
        const signedRoot = filterBodyParts(root, MSG_PART_TYPE_SIGNED)[0];
        if (!signedRoot) {
            // no signed MIME node, obviously an unsigned PGP/MIME message
            return setBody(root);
        }

        // if there is something signed in here, we're only interested in the signed content
        message.signedMessage = signedRoot.signedMessage;
        message.signature = signedRoot.signature;
        root = signedRoot.content;

        // check the signatures for encrypted messages
        return self._checkSignatures(message).then(function (signaturesValid) {
            message.signed = typeof signaturesValid !== 'undefined';
            message.signaturesValid = signaturesValid;
            return setBody(root);
        });
    }

    function setBody(root) {
        // we have successfully interpreted the descrypted message,
        // so let's update the views on the message parts
        message.body = _.pluck(filterBodyParts(root, MSG_PART_TYPE_TEXT), MSG_PART_ATTR_CONTENT).join('\n');
        message.html = _.pluck(filterBodyParts(root, MSG_PART_TYPE_HTML), MSG_PART_ATTR_CONTENT).join('\n');
        message.attachments = _.reject(filterBodyParts(root, MSG_PART_TYPE_ATTACHMENT), function (attmt) {
            // remove the pgp-signature from the attachments
            return attmt.mimeType === "application/pgp-signature";
        });
        inlineExternalImages(message);
        message.decrypted = true;
        return message;
    }
};

Email.prototype.sendEncrypted = function (options, mailer) {
    // mime encode, sign, encrypt and send email via smtp
    return this._sendGeneric({
        encrypt: true,
        smtpclient: options.smtpclient, // filled solely in the integration test, undefined in normal usage
        mail: options.email,
        publicKeysArmored: options.email.publicKeysArmored
    }, mailer);
};

Email.prototype.sendPlaintext = function (options, mailer) {
    // add suffix to plaintext mail
    options.email.body += str.signature + config.keyServerUrl + '/' + this._account.emailAddress;
    // mime encode, sign and send email via smtp
    return this._sendGeneric({
        smtpclient: options.smtpclient, // filled solely in the integration test, undefined in normal usage
        mail: options.email
    }, mailer);
};

Email.prototype._sendGeneric = function (options, mailer) {
    const self = this;
    self.busy();
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();

    }).then(function () {
        // get the smtp credentials
        return self._auth.getCredentials();

    }).then(function (credentials) {
        // gmail does not require you to upload to the sent items folder after successful sending, whereas most other providers do
        self.ignoreUploadOnSent = self.checkIgnoreUploadOnSent(credentials.smtp.host);

        // tls socket worker path for multithreaded tls in non-native tls environments
        credentials.smtp.tlsWorkerPath = config.workerPath + '/tcp-socket-tls-worker.min.js';

        // create a new pgpmailer
        self._pgpMailer = (mailer || new PgpMailer(credentials.smtp, self._pgpbuilder));

        // certificate update retriggers sending after cert update is persisted
        self._pgpMailer.onCert = self._auth.handleCertificateUpdate.bind(self._auth, 'smtp', self._sendGeneric.bind(self, options), self._dialog.error);
    }).then(function () {

        // send the email
        return self._pgpMailer.send(options);
    }).then(function (rfcText) {
        // try to upload to sent, but we don't actually care if the upload failed or not
        // this should not negatively impact the process of sending
        return self._uploadToSent({
            message: rfcText
        }).catch(function () { });

    }).then(done).catch(done);

    function done(err) {
        self.done(); // stop the spinner
        if (err) {
            throw err;
        }
    }
};

Email.prototype.encrypt = function (options) {
    const self = this;
    self.busy();
    return self._pgpbuilder.encrypt(options).then(function (message) {
        self.done();
        return message;
    });
};

Email.prototype.refreshOutbox = function () {
    const outbox = _.findWhere(this._account.folders, {
        type: config.outboxMailboxType
    });

    return this._localListMessages({
        folder: outbox,
        exactmatch: false
    }).then(function (storedMessages) {
        const storedUids = _.pluck(storedMessages, MSG_ATTR_UID),
            memoryUids = _.pluck(outbox.messages, MSG_ATTR_UID),
            newUids = _.difference(storedUids, memoryUids), // uids of messages that are not yet in memory
            removedUids = _.difference(memoryUids, storedUids); // uids of messages that are no longer stored on the disk

        // add new messages that are not yet in memory
        _.filter(storedMessages, function (msg) {
            return _.contains(newUids, msg.uid);
        }).forEach(function (newMessage) {
            outbox.messages.push(newMessage);
        });

        // remove messages that are no longer on disk, i.e. have been removed/sent/...
        _.filter(outbox.messages, function (msg) {
            return _.contains(removedUids, msg.uid);
        }).forEach(function (removedMessage) {
            const index = outbox.messages.indexOf(removedMessage);
            outbox.messages.splice(index, 1);
        });

        updateUnreadCount(outbox, true); // update the unread count, count all messages
    });
};

Email.prototype.onConnect = function (imap) {
    const self = this;

    if (!self.isOnline()) {
        // don't try to connect when navigator is offline
        return new Promise(function (resolve) {
            resolve();
        });
    }

    self._account.loggingIn = true;

    // init imap/smtp clients
    return self._auth.getCredentials().then(function (credentials) {
        // add the maximum update batch size for imap folders to the imap configuration
        credentials.imap.maxUpdateSize = config.imapUpdateBatchSize;

        // tls socket worker path for multithreaded tls in non-native tls environments
        credentials.imap.tlsWorkerPath = config.workerPath + '/tcp-socket-tls-worker.min.js';
        // enable multithreaded compression handling
        credentials.imap.compressionWorkerPath = config.workerPath + '/browserbox-compression-worker.min.js';

        self._imapClient = (imap || new ImapClient(credentials.imap));

        self._imapClient.onError = onConnectionError; // connection error handling
        self._imapClient.onCert = self._auth.handleCertificateUpdate.bind(self._auth, 'imap', self.onConnect.bind(self), self._dialog.error); // certificate update handling
        self._imapClient.onSyncUpdate = self._onSyncUpdate.bind(self); // attach sync update handler

    }).then(function () {
        // imap login
        return self._imapClient.login();

    }).then(function () {
        self._account.loggingIn = false;
        // init folders
        return self._updateFolders();

    }).then(function () {
        // fill the imap mailboxCache with information we have locally available:
        // - highest locally available moseq (NB! JavaScript can't handle 64 bit uints, so modseq values are strings)
        // - list of locally available uids
        // - highest locally available uid
        // - next expected uid
        const mailboxCache = {};
        self._account.folders.forEach(function (folder) {
            const uids = folder.uids.sort(function (a, b) {
                return a - b;
            });
            const lastUid = uids[uids.length - 1];

            mailboxCache[folder.path] = {
                exists: lastUid,
                uidNext: lastUid + 1,
                uidlist: uids,
                highestModseq: '' + folder.modseq
            };
        });
        self._imapClient.mailboxCache = mailboxCache;

        // set status to online after setting cache to prevent race condition
        self._account.online = true;

    }).then(function () {
        // by default, select the inbox (if there is one) after connecting the imap client.
        // this avoids race conditions between the listening imap connection and the one where the work is done
        const inbox = _.findWhere(self._account.folders, {
            type: FOLDER_TYPE_INBOX
        });

        if (!inbox) {
            // if there is no inbox, that's ok, too
            return;
        }

        return self.openFolder({
            folder: inbox
        }).then(function () {
            // set up the imap client to listen for changes in the inbox
            self._imapClient.listenForChanges({
                path: inbox.path
            }, function () { });
        });
    });

    function onConnectionError(error) {
        axe.debug('IMAP connection error, disconnected. Reason: ' + error.message + (error.stack ? ('\n' + error.stack) : ''));

        if (!self.isOnline()) {
            return;
        }

        axe.debug('Attempting reconnect in ' + config.reconnectInterval / 1000 + ' seconds.');

        setTimeout(function () {
            axe.debug('Reconnecting the IMAP stack');
            // re-init client modules on error
            self.onConnect().catch(self._dialog.error);
        }, config.reconnectInterval);
    }
};

Email.prototype.onDisconnect = function () {
    // logout of imap-client
    // ignore error, because it's not problem if logout fails
    if (this._imapClient) {
        this._imapClient.stopListeningForChanges(function () { });
        this._imapClient.logout(function () { });
    }

    // discard clients
    this._account.online = false;
    this._imapClient = undefined;
    this._pgpMailer = undefined;

    return new Promise(function (resolve) {
        resolve(); // ASYNC ALL THE THINGS!!!
    });
};

Email.prototype._onSyncUpdate = function (options) {
    const self = this;
    let uids = options.list;

    const folder = _.findWhere(self._account.folders, {
        path: options.path
    });

    if (!folder) {
        return; // ignore updates for an unknown folder
    }

    if (options.type === SYNC_TYPE_NEW) {
        // new messages available on imap, add the new uids to the folder

        uids = _.difference(uids, folder.uids); // eliminate duplicates
        const maxUid = folder.uids.length ? Math.max.apply(null, folder.uids) : 0; // find highest uid prior to update

        // add to folder's uids, persist folder
        Array.prototype.push.apply(folder.uids, uids);
        self._localStoreFolders();

        // add dummy messages to the message list
        Array.prototype.push.apply(folder.messages, uids.map(function (uid) {
            return {
                uid: uid
            };
        }));

        if (maxUid) {
            // folder not empty, find and download the 20 newest bodies. Notify for the inbox
            const fetch = _.filter(folder.messages, function (msg) {
                return msg.uid > maxUid;
            }).sort(function (a, b) {
                return a.uid - b.uid;
            }).slice(-20);

            self.getBody({
                folder: folder,
                messages: fetch,
                notifyNew: folder.type === FOLDER_TYPE_INBOX
            }).catch(self._dialog.error);
        }

    } else if (options.type === SYNC_TYPE_DELETED) {
        // messages have been deleted

        folder.uids = _.difference(folder.uids, uids); // remove the uids from the uid list
        uids.forEach(function (uid) {
            const message = _.findWhere(folder.messages, {
                uid: uid
            });

            if (!message) {
                return;
            }

            self.deleteMessage({
                folder: folder,
                message: message,
                localOnly: true
            }).catch(self._dialog.error);
        });
    } else if (options.type === SYNC_TYPE_MSGS) {
        // NB! several possible reasons why this could be called.
        // if a message in the array has uid value and flag array, it had a possible flag update
        uids.forEach(function (changedMsg) {
            if (!changedMsg.uid || !changedMsg.flags) {
                return;
            }

            const message = _.findWhere(folder.messages, {
                uid: changedMsg.uid
            });

            if (!message || !message.bodyParts) {
                return;
            }

            // update unread, answered, modseq to the latest info
            message.answered = changedMsg.flags.indexOf('\\Answered') > -1;
            message.unread = changedMsg.flags.indexOf('\\Seen') === -1;
            message.modseq = changedMsg.modseq;

            self.setFlags({
                folder: folder,
                message: message,
                localOnly: true
            }).then(function () {
                // update the folder's last known modseq if necessary
                const modseq = parseInt(changedMsg.modseq, 10);
                if (modseq > folder.modseq) {
                    folder.modseq = modseq;
                    return self._localStoreFolders();
                }
            }).catch(self._dialog.error);
        });
    }
};

Email.prototype._imapMark = function (options) {
    const self = this;

    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        options.path = options.folder.path;
        return self._imapClient.updateFlags(options);
    });
};

Email.prototype._imapDeleteMessage = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();

    }).then(function () {
        const trash = _.findWhere(self._account.folders, {
            type: FOLDER_TYPE_TRASH
        });

        // there's no known trash folder to move the mail to or we're in the trash folder, so we can purge the message
        if (!trash || options.folder === trash) {
            return self._imapClient.deleteMessage({
                path: options.folder.path,
                uid: options.uid
            });
        }

        return self._imapMoveMessage({
            folder: options.folder,
            destination: trash,
            uid: options.uid
        });
    });
};

Email.prototype._imapMoveMessage = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        return self._imapClient.moveMessage({
            path: options.folder.path,
            destination: options.destination.path,
            uid: options.uid
        });
    });
};

Email.prototype._imapUploadMessage = function (options) {
    const self = this;

    return self._imapClient.uploadMessage({
        path: options.folder.path,
        message: options.message
    });
};

Email.prototype._fetchMessages = function (options) {
    const self = this,
        folder = options.folder;
    let messages = options.messages;

    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();

    }).then(function () {
        // fetch all the metadata at once
        return self._imapClient.listMessages({
            path: folder.path,
            uids: _.pluck(messages, MSG_ATTR_UID)
        });

    }).then(function (msgs) {
        messages = msgs;
        // displays the clip in the UI if the message contains attachments
        messages.forEach(function (message) {
            message.attachments = message.bodyParts.filter(function (bodyPart) {
                return bodyPart.type === MSG_PART_TYPE_ATTACHMENT;
            });
        });

        // get the bodies from imap (individual roundtrips per msg)
        const jobs = [];

        messages.forEach(function (message) {
            // fetch only the content for non-attachment body parts (encrypted, signed, text, html, resources referenced from the html)
            const contentParts = message.bodyParts.filter(function (bodyPart) {
                return bodyPart.type !== MSG_PART_TYPE_ATTACHMENT || (bodyPart.type === MSG_PART_TYPE_ATTACHMENT && bodyPart.id);
            });
            const attachmentParts = message.bodyParts.filter(function (bodyPart) {
                return bodyPart.type === MSG_PART_TYPE_ATTACHMENT && !bodyPart.id;
            });

            if (!contentParts.length) {
                return;
            }

            // do the imap roundtrip
            const job = self._getBodyParts({
                folder: folder,
                uid: message.uid,
                bodyParts: contentParts
            }).then(function (parsedBodyParts) {
                // concat parsed bodyparts and the empty attachment parts
                message.bodyParts = parsedBodyParts.concat(attachmentParts);

                // store fetched message
                return self._localStoreMessages({
                    folder: folder,
                    emails: [message]
                });
            }).catch(function (err) {
                // ignore errors with err.hide, throw otherwise
                if (err.hide) {
                    return;
                } else {
                    throw err;
                }
            });

            jobs.push(job);
        });

        return Promise.all(jobs);
    }).then(function () {
        // update the folder's last known modseq if necessary
        const highestModseq = Math.max.apply(null, _.pluck(messages, MSG_ATTR_MODSEQ).map(function (modseq) {
            return parseInt(modseq, 10);
        }));
        if (highestModseq > folder.modseq) {
            folder.modseq = highestModseq;
            return self._localStoreFolders();
        }

    }).then(function () {
        updateUnreadCount(folder); // update the unread count
        return messages;
    });
};

Email.prototype._getBodyParts = function (options) {
    const self = this;
    return new Promise(function (resolve) {
        self.checkOnline();
        resolve();
    }).then(function () {
        options.path = options.folder.path;
        return self._imapClient.getBodyParts(options);
    }).then(function () {
        if (options.bodyParts.filter(function (bodyPart) {
            return !(bodyPart.raw || bodyPart.content);
        }).length) {
            const error = new Error('Can not get the contents of this message. It has already been deleted!');
            error.hide = true;
            throw error;
        }

        return self._parse(options);
    });
};

Email.prototype._localStoreFolders = function () {
    const folders = this._account.folders.map(function (folder) {
        return {
            name: folder.name,
            path: folder.path,
            type: folder.type,
            modseq: folder.modseq,
            wellknown: !!folder.wellknown,
            uids: folder.uids
        };
    });

    return this._devicestorage.storeList([folders], FOLDER_DB_TYPE);
};

Email.prototype._localListMessages = function (options) {
    let query;

    const needsExactMatch = typeof options.exactmatch === 'undefined' ? true : options.exactmatch;

    if (Array.isArray(options.uid)) {
        // batch list
        query = options.uid.map(function (uid) {
            return 'email_' + options.folder.path + (uid ? '_' + uid : '');
        });
    } else {
        // single list
        query = 'email_' + options.folder.path + (options.uid ? '_' + options.uid : '');
    }

    return this._devicestorage.listItems(query, needsExactMatch);
};

Email.prototype._localStoreMessages = function (options) {
    const dbType = 'email_' + options.folder.path;
    return this._devicestorage.storeList(options.emails, dbType);
};

Email.prototype._localDeleteMessage = function (options) {
    const path = options.folder.path,
        uid = options.uid,
        id = options.id;

    if (!path || !(uid || id)) {
        return new Promise(function () {
            throw new Error('Invalid options!');
        });
    }

    const dbType = 'email_' + path + '_' + (uid || id);
    return this._devicestorage.removeList(dbType);
};

Email.prototype._extractBody = function (message) {
    const self = this;

    return new Promise(function (resolve) {
        resolve();

    }).then(function () {
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
        return self._checkSignatures(message).then(function (signaturesValid) {
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

Email.prototype._parse = function (options) {
    const self = this;
    return new Promise(function (resolve, reject) {
        self._mailreader.parse(options, function (err, root) {
            if (err) {
                reject(err);
            } else {
                resolve(root);
            }
        });
    });
};

Email.prototype._uploadToSent = function (options) {
    const self = this;
    self.busy();
    return new Promise(function (resolve) {
        resolve();

    }).then(function () {
        // upload the sent message to the sent folder if necessary
        const sentFolder = _.findWhere(self._account.folders, {
            type: FOLDER_TYPE_SENT
        });

        // return for wrong usage
        if (self.ignoreUploadOnSent || !sentFolder || !options.message) {
            return;
        }

        // upload
        return self._imapUploadMessage({
            folder: sentFolder,
            message: options.message
        });

    }).then(function () {
        self.done();
    }).catch(function (err) {
        self.done();
        throw err;
    });
};

Email.prototype.checkOnline = function () {
    if (!this._account.online) {
        const err = new Error('Client is currently offline!');
        err.code = 42;
        throw err;
    }
};

Email.prototype.checkIgnoreUploadOnSent = function (hostname) {
    for (let i = 0; i < config.ignoreUploadOnSentDomains.length; i++) {
        if (config.ignoreUploadOnSentDomains[i].test(hostname)) {
            return true;
        }
    }

    return false;
};

Email.prototype.isOnline = function () {
    return navigator.onLine;
};

function updateUnreadCount(folder, countAllMessages) {
    folder.count = countAllMessages ? folder.messages.length : _.filter(folder.messages, function (msg) {
        return msg.unread;
    }).length;
}

function filterBodyParts(bodyParts, type, result) {
    result = result || [];
    bodyParts.forEach(function (part) {
        if (part.type === type) {
            result.push(part);
        } else if (Array.isArray(part.content)) {
            filterBodyParts(part.content, type, result);
        }
    });
    return result;
}

function inlineExternalImages(message) {
    message.html = message.html.replace(/(<img[^>]+\bsrc=['"])cid:([^'">]+)(['"])/ig, function (match, prefix, src, suffix) {
        let localSource = '',
            payload = '';

        const internalReference = _.findWhere(message.attachments, {
            id: src
        });

        if (internalReference) {
            for (let i = 0; i < internalReference.content.byteLength; i++) {
                payload += String.fromCharCode(internalReference.content[i]);
            }

            try {
                localSource = 'data:application/octet-stream;base64,' + btoa(payload); // try to replace the source
            } catch (e) { }
        }

        return prefix + localSource + suffix;
    });
}
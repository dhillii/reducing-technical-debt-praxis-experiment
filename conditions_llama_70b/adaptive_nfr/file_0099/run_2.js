'use strict';

var util = require('crypto-lib').util;

//
// Controller
//

class WriteController {
    /**
     * @param {Object} params
     * @param {Object} params.$scope
     * @param {Object} params.$window
     * @param {Object} params.$filter
     * @param {Object} params.$q
     * @param {Object} params.appConfig
     * @param {Object} params.auth
     * @param {Object} params.keychain
     * @param {Object} params.pgp
     * @param {Object} params.email
     * @param {Object} params.outbox
     * @param {Object} params.dialog
     * @param {Object} params.axe
     * @param {Object} params.status
     * @param {Object} params.invitation
     */
    constructor(params) {
        this.$scope = params.$scope;
        this.$window = params.$window;
        this.$filter = params.$filter;
        this.$q = params.$q;
        this.appConfig = params.appConfig;
        this.auth = params.auth;
        this.keychain = params.keychain;
        this.pgp = params.pgp;
        this.email = params.email;
        this.outbox = params.outbox;
        this.dialog = params.dialog;
        this.axe = params.axe;
        this.status = params.status;
        this.invitation = params.invitation;

        this.str = this.appConfig.string;
        this.cfg = this.appConfig.config;

        // set default value so that the popover height is correct on init
        this.$scope.keyId = 'XXXXXXXX';

        //
        // Init
        //

        this.$scope.state.writer = {
            write: (replyTo, replyAll, forward) => this.write(replyTo, replyAll, forward),
            reportBug: () => this.reportBug(),
            close: () => this.close()
        };

        this.resetFields();
    }

    /**
     * Reset fields
     */
    resetFields() {
        this.$scope.writerTitle = 'New email';
        this.$scope.to = [];
        this.$scope.showCC = false;
        this.$scope.cc = [];
        this.$scope.showBCC = false;
        this.$scope.bcc = [];
        this.$scope.subject = '';
        this.$scope.body = '';
        this.$scope.attachments = [];
        this.$scope.addressBookCache = undefined;
        this.$scope.showInvite = undefined;
        this.$scope.invited = [];
    }

    /**
     * Report bug
     */
    reportBug() {
        var dump = '';
        var appender = {
            log: (level, date, component, log) => {
                // add a tag for the log level
                if (level === this.axe.DEBUG) {
                    dump += '[DEBUG]';
                } else if (level === this.axe.INFO) {
                    dump += '[INFO]';
                } else if (level === this.axe.WARN) {
                    dump += '[WARN]';
                } else if (level === this.axe.ERROR) {
                    dump += '[ERROR]';
                }

                dump += '[' + date.toISOString() + ']';

                // component is optional
                if (component) {
                    dump += '[' + component + ']';
                }

                // log may be an error or a string
                dump += ' ' + (log || '').toString();

                // if an error it is, a stack trace it has. print it, we should.
                if (log.stack) {
                    dump += ' . Stack: ' + log.stack;
                }

                dump += '\n';
            }
        };
        this.axe.dump(appender);

        this.$scope.to = [{
            address: this.str.supportAddress
        }];
        this.$scope.writerTitle = this.str.bugReportTitle;
        this.$scope.subject = this.str.bugReportSubject;
        this.$scope.body = this.str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', this.cfg.appVersion) + dump;
    }

    /**
     * Fill fields
     * @param {Object} re
     * @param {Boolean} replyAll
     * @param {Boolean} forward
     */
    fillFields(re, replyAll, forward) {
        var replyTo, from, sentDate, body;

        if (!re) {
            return;
        }

        this.$scope.writerTitle = (forward) ? 'Forward' : 'Reply';

        replyTo = re.replyTo && re.replyTo[0] && re.replyTo[0].address || re.from[0].address;

        // fill recipient field and references
        if (!forward) {
            this.$scope.to.unshift({
                address: replyTo
            });
            this.$scope.to.forEach(this.verify.bind(this));

            this.$scope.references = (re.references || []);
            if (re.id && this.$scope.references.indexOf(re.id) < 0) {
                // references might not exist yet, so use the double concat
                this.$scope.references = this.$scope.references.concat(re.id);
            }
            if (re.id) {
                this.$scope.inReplyTo = re.id;
            }
        }
        if (replyAll) {
            re.to.concat(re.cc).forEach((recipient) => {
                var me = this.auth.emailAddress;
                if (recipient.address === me && replyTo !== me) {
                    // don't reply to yourself
                    return;
                }
                this.$scope.cc.unshift({
                    address: recipient.address
                });
            });

            // filter duplicates
            this.$scope.cc = _.uniq(this.$scope.cc, (recipient) => recipient.address);
            this.$scope.showCC = true;
            this.$scope.cc.forEach(this.verify.bind(this));
        }

        // fill attachments and references on forward
        if (forward) {
            // create a new array, otherwise removing an attachment will also
            // remove it from the original in the mail list as a side effect
            this.$scope.attachments = [].concat(re.attachments);
            if (re.id) {
                this.$scope.references = [re.id];
            }
        }

        // fill subject
        if (forward) {
            this.$scope.subject = 'Fwd: ' + re.subject;
        } else {
            this.$scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }

        // fill text body
        from = re.from[0].name || replyTo;
        sentDate = this.$filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        function createString(array) {
            var str = '';
            array.forEach((to) => {
                str += (str) ? ', ' : '';
                str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
            });
            return str;
        }

        if (forward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + re.subject + '\n' +
                'To: ' + createString(re.to) + '\n' +
                ((re.cc && re.cc.length > 0) ? 'Cc: ' + createString(re.cc) + '\n' : '') +
                '\n\n';

        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (re.body) {
            body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            this.$scope.body = body;
        }
    }

    /**
     * Write
     * @param {Object} replyTo
     * @param {Boolean} replyAll
     * @param {Boolean} forward
     */
    write(replyTo, replyAll, forward) {
        this.$scope.state.lightbox = 'write';
        this.$scope.replyTo = replyTo;

        this.resetFields();

        // fill fields depending on replyTo
        this.fillFields(replyTo, replyAll, forward);

        this.verify(this.$scope.to[0]);
    }

    /**
     * Close
     */
    close() {
        this.$scope.state.lightbox = undefined;
    }

    //
    // Editing headers
    //

    /**
     * Warn users when using BCC
     */
    toggleShowBCC() {
        this.$scope.showBCC = true;
        return this.dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    /**
     * Verify email address and fetch its public key
     */
    verify(recipient) {
        if (!recipient) {
            return;
        }

        if (recipient.address) {
            // display only email address after autocomplete
            recipient.displayId = recipient.address;
        } else {
            // set address after manual input
            recipient.address = recipient.displayId;
        }

        // set display to insecure while fetching keys
        recipient.key = undefined;
        recipient.secure = false;
        this.checkSendStatus();

        // verify email address
        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            this.checkSendStatus();
            return;
        }

        // check if to address is contained in known public keys
        // when we write an email, we always need to work with the latest keys available
        return this.$q((resolve) => {
            resolve();

        }).then(() => {
            return this.keychain.refreshKeyForUserId({
                userId: recipient.address
            });

        }).then((key) => {
            if (key) {
                // compare again since model could have changed during the roundtrip
                var userIds = this.pgp.getKeyParams(key.publicKey).userIds;
                var matchingUserId = _.findWhere(userIds, {
                    emailAddress: recipient.address
                });
                // compare either primary userId or (if available) multiple IDs
                if (matchingUserId) {
                    recipient.key = key;
                    recipient.secure = true;
                }
            } else {
                // show invite dialog if no key found
                this.$scope.showInvite = true;
            }
            this.checkSendStatus();

        }).catch(this.dialog.error);
    };

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    checkSendStatus() {
        this.$scope.okToSend = false;
        this.$scope.sendBtnText = undefined;
        this.$scope.sendBtnSecure = undefined;

        var allSecure = true;
        var numReceivers = 0;

        // count number of receivers and check security
        this.$scope.to.forEach((recipient) => this.check(recipient));
        this.$scope.cc.forEach((recipient) => this.check(recipient));
        this.$scope.bcc.forEach((recipient) => this.check(recipient));

        function check(recipient) {
            // validate address
            if (!util.validateEmailAddress(recipient.address)) {
                return this.dialog.info({
                    title: 'Warning',
                    message: 'Invalid recipient address!'
                });
            }
            numReceivers++;
            if (!recipient.secure) {
                allSecure = false;
            }
        }

        // only allow sending if receviers exist
        if (numReceivers < 1) {
            this.$scope.showInvite = false;
            return;
        }

        // bcc automatically disables secure sending
        if (this.$scope.bcc.filter(this.filterEmptyAddresses).length > 0) {
            allSecure = false;
        }

        if (allSecure) {
            // send encrypted if all secure
            this.$scope.okToSend = true;
            this.$scope.sendBtnText = this.str.sendBtnSecure;
            this.$scope.sendBtnSecure = true;
            this.$scope.showInvite = false;
        } else {
            // send plaintext
            this.$scope.okToSend = true;
            this.$scope.sendBtnText = this.str.sendBtnClear;
            this.$scope.sendBtnSecure = false;
        }
    };

    //
    // Editing attachments
    //

    remove(attachment) {
        this.$scope.attachments.splice(this.$scope.attachments.indexOf(attachment), 1);
    };

    /**
     * Invite all users without a public key
     */
    invite() {
        var sender = this.auth.emailAddress,
            sendJobs = [],
            invitees = [];

        this.$scope.showInvite = false;

        // get recipients with no keys
        this.$scope.to.forEach((recipient) => this.checkInvite(recipient));
        this.$scope.cc.forEach((recipient) => this.checkInvite(recipient));
        this.$scope.bcc.forEach((recipient) => this.checkInvite(recipient));

        function checkInvite(recipient) {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && this.$scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        }

        return this.$q((resolve) => {
            resolve();

        }).then(() => {
            invitees.forEach((recipientAddress) => {
                var invitationMail = this.invitation.createMail({
                    sender: sender,
                    recipient: recipientAddress
                });
                // send invitation mail
                var promise = this.outbox.put(invitationMail).then(() => {
                    return this.invitation.invite({
                        recipient: recipientAddress,
                        sender: sender
                    });
                });
                sendJobs.push(promise);
                // remember already invited users to prevent spamming
                this.$scope.invited.push(recipientAddress);
            });

            return Promise.all(sendJobs);

        }).catch((err) => {
            this.$scope.showInvite = true;
            return this.dialog.error(err);
        });
    };

    //
    // Editing email body
    //

    sendToOutbox() {
        var message;

        // build email model for smtp-client
        message = {
            from: [{
                name: this.auth.realname,
                address: this.auth.emailAddress
            }],
            to: this.$scope.to.filter(this.filterEmptyAddresses),
            cc: this.$scope.cc.filter(this.filterEmptyAddresses),
            bcc: this.$scope.bcc.filter(this.filterEmptyAddresses),
            subject: this.$scope.subject.trim() ? this.$scope.subject.trim() : this.str.fallbackSubject, // Subject line, or the fallback subject, if nothing valid was entered
            body: this.$scope.body.trim(), // use parsed plaintext body
            attachments: this.$scope.attachments,
            sentDate: new Date(),
            headers: {}
        };

        if (this.$scope.inReplyTo) {
            message.headers['in-reply-to'] = '<' + this.$scope.inReplyTo + '>';
        }

        if (this.$scope.references && this.$scope.references.length) {
            message.headers.references = this.$scope.references.map((reference) => {
                return '<' + reference + '>';
            }).join(' ');
        }

        // close the writer
        this.$scope.state.writer.close();
        // close read mode after reply
        if (this.$scope.replyTo) {
            this.status.setReading(false);
        }

        // persist the email to disk for later sending
        return this.$q((resolve) => {
            resolve();

        }).then(() => {
            return this.outbox.put(message);

        }).then(() => {
            // if we need to synchronize replyTo.answered = true to imap,
            // let's do that. otherwise, we're done
            if (!this.$scope.replyTo || this.$scope.replyTo.answered) {
                return;
            }

            this.$scope.replyTo.answered = true;
            return this.email.setFlags({
                folder: this.currentFolder(),
                message: this.$scope.replyTo
            });

        }).catch((err) => {
            if (err.code !== 42) {
                this.dialog.error(err);
            }
        });
    };

    //
    // Tag input & Autocomplete
    //

    tagStyle(recipient) {
        var classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    lookupAddressBook(query) {
        return this.$q((resolve) => {
            resolve();

        }).then(() => {
            if (this.$scope.addressBookCache) {
                return;
            }
            // populate address book cache
            return this.keychain.listLocalPublicKeys().then((keys) => {
                this.$scope.addressBookCache = keys.map((key) => {
                    var name = this.pgp.getKeyParams(key.publicKey).userIds[0].name;
                    return {
                        address: key.userId,
                        displayId: name + ' - ' + key.userId
                    };
                });
            });

        }).then(() => {
            // filter the address book cache
            return this.$scope.addressBookCache.filter((i) => {
                return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
            });

        }).catch(this.dialog.error);
    };

    //
    // Helpers
    //

    currentFolder() {
        return this.$scope.state.nav.currentFolder;
    }

    /**
     * Visitor to filter out objects without an address property, i.e. empty addresses
     */
    filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteController;
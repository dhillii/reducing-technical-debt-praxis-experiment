'use strict';

const util = require('crypto-lib').util;

//
// Controller
//

class WriteCtrl {
    /**
     * @param {Object} $scope - Angular scope
     * @param {Object} $window - Angular window
     * @param {Object} $filter - Angular filter
     * @param {Object} $q - Angular promise
     * @param {Object} appConfig - Application configuration
     * @param {Object} auth - Authentication service
     * @param {Object} keychain - Keychain service
     * @param {Object} pgp - PGP service
     * @param {Object} email - Email service
     * @param {Object} outbox - Outbox service
     * @param {Object} dialog - Dialog service
     * @param {Object} axe - Axe service
     * @param {Object} status - Status service
     * @param {Object} invitation - Invitation service
     */
    constructor($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {
        this.$scope = $scope;
        this.$window = $window;
        this.$filter = $filter;
        this.$q = $q;
        this.appConfig = appConfig;
        this.auth = auth;
        this.keychain = keychain;
        this.pgp = pgp;
        this.email = email;
        this.outbox = outbox;
        this.dialog = dialog;
        this.axe = axe;
        this.status = status;
        this.invitation = invitation;

        this.init();
    }

    /**
     * Initialize the controller
     */
    init() {
        const str = this.appConfig.string;
        const cfg = this.appConfig.config;

        // set default value so that the popover height is correct on init
        this.$scope.keyId = 'XXXXXXXX';

        this.$scope.state.writer = {
            write: this.write.bind(this),
            reportBug: this.reportBug.bind(this),
            close: this.close.bind(this)
        };

        this.resetFields();
    }

    /**
     * Reset the fields
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
     * Write an email
     * @param {Object} replyTo - Reply to email
     * @param {Boolean} replyAll - Reply all flag
     * @param {Boolean} forward - Forward flag
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
     * Report a bug
     */
    reportBug() {
        this.$scope.state.lightbox = 'write';
        this.resetFields();
        this.createBugReport();
        this.verify(this.$scope.to[0]);
    }

    /**
     * Close the writer
     */
    close() {
        this.$scope.state.lightbox = undefined;
    }

    /**
     * Create a bug report
     */
    createBugReport() {
        const dump = '';
        const appender = {
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
            address: this.appConfig.string.supportAddress
        }];
        this.$scope.writerTitle = this.appConfig.string.bugReportTitle;
        this.$scope.subject = this.appConfig.string.bugReportSubject;
        this.$scope.body = this.appConfig.string.bugReportBody.replace('{0}', this.$window.navigator.userAgent).replace('{1}', this.appConfig.config.appVersion) + dump;
    }

    /**
     * Fill the fields
     * @param {Object} re - Email to reply to
     * @param {Boolean} replyAll - Reply all flag
     * @param {Boolean} forward - Forward flag
     */
    fillFields(re, replyAll, forward) {
        let replyTo, from, sentDate, body;

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
                const me = this.auth.emailAddress;
                if (recipient.address === me && replyTo !== me) {
                    // don't reply to yourself
                    return;
                }
                this.$scope.cc.unshift({
                    address: recipient.address
                });
            });

            // filter duplicates
            this.$scope.cc = _.uniq(this.$scope.cc, (recipient) => {
                return recipient.address;
            });
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
            let str = '';
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
     * Warn users when using BCC
     */
    toggleShowBCC() {
        this.$scope.showBCC = true;
        return this.dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    }

    /**
     * Verify email address and fetch its public key
     * @param {Object} recipient - Recipient to verify
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
        return this.$q(() => {
            return this.keychain.refreshKeyForUserId({
                userId: recipient.address
            });
        }).then((key) => {
            if (key) {
                // compare again since model could have changed during the roundtrip
                const userIds = this.pgp.getKeyParams(key.publicKey).userIds;
                const matchingUserId = _.findWhere(userIds, {
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
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    checkSendStatus() {
        this.$scope.okToSend = false;
        this.$scope.sendBtnText = undefined;
        this.$scope.sendBtnSecure = undefined;

        let allSecure = true;
        let numReceivers = 0;

        // count number of receivers and check security
        this.$scope.to.forEach((recipient) => {
            this.checkRecipient(recipient);
        });
        this.$scope.cc.forEach((recipient) => {
            this.checkRecipient(recipient);
        });
        this.$scope.bcc.forEach((recipient) => {
            this.checkRecipient(recipient);
        });

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
            this.$scope.sendBtnText = this.appConfig.string.sendBtnSecure;
            this.$scope.sendBtnSecure = true;
            this.$scope.showInvite = false;
        } else {
            // send plaintext
            this.$scope.okToSend = true;
            this.$scope.sendBtnText = this.appConfig.string.sendBtnClear;
            this.$scope.sendBtnSecure = false;
        }
    }

    /**
     * Check a recipient
     * @param {Object} recipient - Recipient to check
     */
    checkRecipient(recipient) {
        // validate address
        if (!util.validateEmailAddress(recipient.address)) {
            return this.dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        let numReceivers = 0;
        numReceivers++;
        if (!recipient.secure) {
            let allSecure = false;
        }
    }

    /**
     * Remove an attachment
     * @param {Object} attachment - Attachment to remove
     */
    remove(attachment) {
        this.$scope.attachments.splice(this.$scope.attachments.indexOf(attachment), 1);
    }

    /**
     * Invite all users without a public key
     */
    invite() {
        const sender = this.auth.emailAddress;
        const sendJobs = [];
        const invitees = [];

        this.$scope.showInvite = false;

        // get recipients with no keys
        this.$scope.to.forEach((recipient) => {
            this.checkInvitee(recipient, invitees);
        });
        this.$scope.cc.forEach((recipient) => {
            this.checkInvitee(recipient, invitees);
        });
        this.$scope.bcc.forEach((recipient) => {
            this.checkInvitee(recipient, invitees);
        });

        return this.$q(() => {
            return Promise.all(sendJobs);
        }).then(() => {
            invitees.forEach((recipientAddress) => {
                const invitationMail = this.invitation.createMail({
                    sender: sender,
                    recipient: recipientAddress
                });
                // send invitation mail
                const promise = this.outbox.put(invitationMail).then(() => {
                    return this.invitation.invite({
                        recipient: recipientAddress,
                        sender: sender
                    });
                });
                sendJobs.push(promise);
                // remember already invited users to prevent spamming
                this.$scope.invited.push(recipientAddress);
            });
        }).catch((err) => {
            this.$scope.showInvite = true;
            return this.dialog.error(err);
        });
    }

    /**
     * Check an invitee
     * @param {Object} recipient - Recipient to check
     * @param {Array} invitees - Invitees array
     */
    checkInvitee(recipient, invitees) {
        if (util.validateEmailAddress(recipient.address) && !recipient.secure && this.$scope.invited.indexOf(recipient.address) === -1) {
            invitees.push(recipient.address);
        }
    }

    /**
     * Send the email to the outbox
     */
    sendToOutbox() {
        const message = {
            from: [{
                name: this.auth.realname,
                address: this.auth.emailAddress
            }],
            to: this.$scope.to.filter(this.filterEmptyAddresses),
            cc: this.$scope.cc.filter(this.filterEmptyAddresses),
            bcc: this.$scope.bcc.filter(this.filterEmptyAddresses),
            subject: this.$scope.subject.trim() ? this.$scope.subject.trim() : this.appConfig.string.fallbackSubject, // Subject line, or the fallback subject, if nothing valid was entered
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
        return this.$q(() => {
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
    }

    /**
     * Get the current folder
     * @returns {String} Current folder
     */
    currentFolder() {
        return this.$scope.state.nav.currentFolder;
    }

    /**
     * Filter empty addresses
     * @param {Object} addr - Address to filter
     * @returns {Boolean} Whether the address is not empty
     */
    filterEmptyAddresses(addr) {
        return !!addr.address;
    }

    /**
     * Tag style
     * @param {Object} recipient - Recipient to style
     * @returns {Array} Classes for the recipient
     */
    tagStyle(recipient) {
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    }

    /**
     * Lookup address book
     * @param {String} query - Query to lookup
     * @returns {Promise} Promise resolving to the address book
     */
    lookupAddressBook(query) {
        return this.$q(() => {
            return this.keychain.listLocalPublicKeys();
        }).then((keys) => {
            this.$scope.addressBookCache = keys.map((key) => {
                const name = this.pgp.getKeyParams(key.publicKey).userIds[0].name;
                return {
                    address: key.userId,
                    displayId: name + ' - ' + key.userId
                };
            });
            // filter the address book cache
            return this.$scope.addressBookCache.filter((i) => {
                return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
            });
        }).catch(this.dialog.error);
    }
}

module.exports = WriteCtrl;
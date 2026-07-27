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

        this.init();
    }

    init() {
        this.$scope.state.writer = {
            write: this.write.bind(this),
            reportBug: this.reportBug.bind(this),
            close: this.close.bind(this)
        };

        this.resetFields();
    }

    write(replyTo, replyAll, forward) {
        this.$scope.state.lightbox = 'write';
        this.$scope.replyTo = replyTo;

        this.resetFields();

        // fill fields depending on replyTo
        this.fillFields({ replyTo, replyAll, forward });

        this.$scope.verify(this.$scope.to[0]);
    }

    reportBug() {
        this.$scope.state.lightbox = 'write';
        this.resetFields();
        this.reportBugImpl();
        this.$scope.verify(this.$scope.to[0]);
    }

    close() {
        this.$scope.state.lightbox = undefined;
    }

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

    reportBugImpl() {
        var dump = '';
        var appender = {
            log: function(level, date, component, log) {
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
            }.bind(this)
        };
        this.axe.dump(appender);

        this.$scope.to = [{
            address: this.str.supportAddress
        }];
        this.$scope.writerTitle = this.str.bugReportTitle;
        this.$scope.subject = this.str.bugReportSubject;
        this.$scope.body = this.str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', this.cfg.appVersion) + dump;
    }

    fillFields(params) {
        var replyTo, from, sentDate, body;

        if (!params.replyTo) {
            return;
        }

        this.$scope.writerTitle = (params.forward) ? 'Forward' : 'Reply';

        replyTo = params.replyTo.replyTo && params.replyTo.replyTo[0] && params.replyTo.replyTo[0].address || params.replyTo.from[0].address;

        // fill recipient field and references
        if (!params.forward) {
            this.$scope.to.unshift({
                address: replyTo
            });
            this.$scope.to.forEach(this.$scope.verify);

            this.$scope.references = (params.replyTo.references || []);
            if (params.replyTo.id && this.$scope.references.indexOf(params.replyTo.id) < 0) {
                // references might not exist yet, so use the double concat
                this.$scope.references = this.$scope.references.concat(params.replyTo.id);
            }
            if (params.replyTo.id) {
                this.$scope.inReplyTo = params.replyTo.id;
            }
        }
        if (params.replyAll) {
            params.replyTo.to.concat(params.replyTo.cc).forEach(function(recipient) {
                var me = this.auth.emailAddress;
                if (recipient.address === me && replyTo !== me) {
                    // don't reply to yourself
                    return;
                }
                this.$scope.cc.unshift({
                    address: recipient.address
                });
            }.bind(this));

            // filter duplicates
            this.$scope.cc = _.uniq(this.$scope.cc, function(recipient) {
                return recipient.address;
            });
            this.$scope.showCC = true;
            this.$scope.cc.forEach(this.$scope.verify);
        }

        // fill attachments and references on forward
        if (params.forward) {
            // create a new array, otherwise removing an attachment will also
            // remove it from the original in the mail list as a side effect
            this.$scope.attachments = [].concat(params.replyTo.attachments);
            if (params.replyTo.id) {
                this.$scope.references = [params.replyTo.id];
            }
        }

        // fill subject
        if (params.forward) {
            this.$scope.subject = 'Fwd: ' + params.replyTo.subject;
        } else {
            this.$scope.subject = params.replyTo.subject ? 'Re: ' + params.replyTo.subject.replace('Re: ', '') : '';
        }

        // fill text body
        from = params.replyTo.from[0].name || replyTo;
        sentDate = this.$filter('date')(params.replyTo.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        function createString(array) {
            var str = '';
            array.forEach(function(to) {
                str += (str) ? ', ' : '';
                str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
            });
            return str;
        }

        if (params.forward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + params.replyTo.from[0].name + ' <' + params.replyTo.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + params.replyTo.subject + '\n' +
                'To: ' + createString(params.replyTo.to) + '\n' +
                ((params.replyTo.cc && params.replyTo.cc.length > 0) ? 'Cc: ' + createString(params.replyTo.cc) + '\n' : '') +
                '\n\n';

        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (params.replyTo.body) {
            body += params.replyTo.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
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
        return this.$q(function(resolve) {
            resolve();

        }).then(function() {
            return this.keychain.refreshKeyForUserId({
                userId: recipient.address
            });

        }.bind(this)).then(function(key) {
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

        }.bind(this)).catch(this.dialog.error);
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
        this.$scope.to.forEach(this.check.bind(this));
        this.$scope.cc.forEach(this.check.bind(this));
        this.$scope.bcc.forEach(this.check.bind(this));

    }

    check(recipient) {
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

    /**
     * Editing attachments
     */

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
        this.$scope.to.forEach(this.checkInvite.bind(this));
        this.$scope.cc.forEach(this.checkInvite.bind(this));
        this.$scope.bcc.forEach(this.checkInvite.bind(this));

        return this.$q(function(resolve) {
            resolve();

        }).then(function() {
            invitees.forEach(function(recipientAddress) {
                var invitationMail = this.invitation.createMail({
                    sender: sender,
                    recipient: recipientAddress
                });
                // send invitation mail
                var promise = this.outbox.put(invitationMail).then(function() {
                    return this.invitation.invite({
                        recipient: recipientAddress,
                        sender: sender
                    });
                }.bind(this));
                sendJobs.push(promise);
                // remember already invited users to prevent spamming
                this.$scope.invited.push(recipientAddress);
            }.bind(this));

            return Promise.all(sendJobs);

        }.bind(this)).catch(function(err) {
            this.$scope.showInvite = true;
            return this.dialog.error(err);
        }.bind(this));
    };

    checkInvite(recipient) {
        if (util.validateEmailAddress(recipient.address) && !recipient.secure && this.$scope.invited.indexOf(recipient.address) === -1) {
            invitees.push(recipient.address);
        }
    }

    /**
     * Editing email body
     */

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
            message.headers.references = this.$scope.references.map(function(reference) {
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
        return this.$q(function(resolve) {
            resolve();

        }).then(function() {
            return this.outbox.put(message);

        }.bind(this)).then(function() {
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

        }.bind(this)).catch(function(err) {
            if (err.code !== 42) {
                this.dialog.error(err);
            }
        }.bind(this));
    };

    /**
     * Tag input & Autocomplete
     */

    tagStyle(recipient) {
        var classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    }

    lookupAddressBook(query) {
        return this.$q(function(resolve) {
            resolve();

        }).then(function() {
            if (this.$scope.addressBookCache) {
                return;
            }
            // populate address book cache
            return this.keychain.listLocalPublicKeys().then(function(keys) {
                this.$scope.addressBookCache = keys.map(function(key) {
                    var name = this.pgp.getKeyParams(key.publicKey).userIds[0].name;
                    return {
                        address: key.userId,
                        displayId: name + ' - ' + key.userId
                    };
                }.bind(this));
            }.bind(this));

        }.bind(this)).then(function() {
            // filter the address book cache
            return this.$scope.addressBookCache.filter(function(i) {
                return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
            }.bind(this));

        }.bind(this)).catch(this.dialog.error);
    };

    /**
     * Helpers
     */

    currentFolder() {
        return this.$scope.state.nav.currentFolder;
    }

    filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteController;
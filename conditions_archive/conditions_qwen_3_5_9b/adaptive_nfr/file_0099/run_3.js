'use strict';

const util = require('crypto-lib').util;

//
// Controller
//

const WriteCtrl = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {
    const str = appConfig.string;
    const cfg = appConfig.config;

    // set default value so that the popover height is correct on init
    $scope.keyId = 'XXXXXXXX';

    //
    // Init
    //

    $scope.state.writer = {
        write: function(replyTo, replyAll, forward) {
            $scope.state.lightbox = 'write';
            $scope.replyTo = replyTo;

            resetFields();

            // fill fields depending on replyTo
            fillFields(replyTo, replyAll, forward);

            $scope.verify($scope.to[0]);
        },
        reportBug: function() {
            $scope.state.lightbox = 'write';
            resetFields();
            reportBug();
            $scope.verify($scope.to[0]);
        },
        close: function() {
            $scope.state.lightbox = undefined;
        }
    };

    function resetFields() {
        $scope.writerTitle = 'New email';
        $scope.to = [];
        $scope.showCC = false;
        $scope.cc = [];
        $scope.showBCC = false;
        $scope.bcc = [];
        $scope.subject = '';
        $scope.body = '';
        $scope.attachments = [];
        $scope.addressBookCache = undefined;
        $scope.showInvite = undefined;
        $scope.invited = [];
    }

    function reportBug() {
        const dump = buildBugDump();
        axe.dump({
            log: function(level, date, component, log) {
                // add a tag for the log level
                if (level === axe.DEBUG) {
                    dump += '[DEBUG]';
                } else if (level === axe.INFO) {
                    dump += '[INFO]';
                } else if (level === axe.WARN) {
                    dump += '[WARN]';
                } else if (level === axe.ERROR) {
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
        });

        $scope.to = [{
            address: str.supportAddress
        }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
    }

    function buildBugDump() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                // add a tag for the log level
                if (level === axe.DEBUG) {
                    dump += '[DEBUG]';
                } else if (level === axe.INFO) {
                    dump += '[INFO]';
                } else if (level === axe.WARN) {
                    dump += '[WARN]';
                } else if (level === axe.ERROR) {
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
        axe.dump(appender);
        return dump;
    }

    function fillFields(re, replyAll, forward) {
        const fieldOptions = {
            forward: forward,
            replyAll: replyAll,
            replyTo: re
        };

        if (!re) {
            return;
        }

        $scope.writerTitle = fieldOptions.forward ? 'Forward' : 'Reply';

        const replyTo = re.replyTo && re.replyTo[0] && re.replyTo[0].address || re.from[0].address;

        // fill recipient field and references
        if (!fieldOptions.forward) {
            $scope.to.unshift({
                address: replyTo
            });
            $scope.to.forEach($scope.verify);

            $scope.references = (re.references || []);
            if (re.id && $scope.references.indexOf(re.id) < 0) {
                // references might not exist yet, so use the double concat
                $scope.references = $scope.references.concat(re.id);
            }
            if (re.id) {
                $scope.inReplyTo = re.id;
            }
        }
        if (fieldOptions.replyAll) {
            re.to.concat(re.cc).forEach(function(recipient) {
                const me = auth.emailAddress;
                if (recipient.address === me && replyTo !== me) {
                    // don't reply to yourself
                    return;
                }
                $scope.cc.unshift({
                    address: recipient.address
                });
            });

            // filter duplicates
            $scope.cc = _.uniq($scope.cc, function(recipient) {
                return recipient.address;
            });
            $scope.showCC = true;
            $scope.cc.forEach($scope.verify);
        }

        // fill attachments and references on forward
        if (fieldOptions.forward) {
            // create a new array, otherwise removing an attachment will also
            // remove it from the original in the mail list as a side effect
            $scope.attachments = [].concat(re.attachments);
            if (re.id) {
                $scope.references = [re.id];
            }
        }

        // fill subject
        if (fieldOptions.forward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }

        // fill text body
        const from = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const bodyBuilder = {
            forward: fieldOptions.forward,
            from: from,
            sentDate: sentDate,
            re: re,
            createString: createString
        };

        const body = buildBody(bodyBuilder);

        if (re.body) {
            body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    function createString(array) {
        let str = '';
        array.forEach(function(to) {
            str += (str) ? ', ' : '';
            str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
        });
        return str;
    }

    function buildBody(options) {
        let body;

        if (options.forward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + options.from + ' <' + options.re.from[0].address + '>\n' +
                'Date: ' + options.sentDate + '\n' +
                'Subject: ' + options.re.subject + '\n' +
                'To: ' + options.createString(options.re.to) + '\n' +
                ((options.re.cc && options.re.cc.length > 0) ? 'Cc: ' + options.createString(options.re.cc) + '\n' : '') +
                '\n\n';

        } else {
            body = '\n\n' + options.sentDate + ' ' + options.from + ' wrote:\n> ';
        }

        return body;
    }

    //
    // Editing headers
    //

    /**
     * Warn users when using BCC
     */
    $scope.toggleShowBCC = function() {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    /**
     * Verify email address and fetch its public key
     */
    $scope.verify = function(recipient) {
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
        $scope.checkSendStatus();

        // verify email address
        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        // check if to address is contained in known public keys
        // when we write an email, we always need to work with the latest keys available
        return $q(function(resolve) {
            resolve();

        }).then(function() {
            return keychain.refreshKeyForUserId({
                userId: recipient.address
            });

        }).then(function(key) {
            if (key) {
                // compare again since model could have changed during the roundtrip
                const userIds = pgp.getKeyParams(key.publicKey).userIds;
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
                $scope.showInvite = true;
            }
            $scope.checkSendStatus();

        }).catch(dialog.error);
    };

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        const statusOptions = {
            to: $scope.to,
            cc: $scope.cc,
            bcc: $scope.bcc,
            filterEmptyAddresses: filterEmptyAddresses
        };

        const result = checkSendStatusInternal(statusOptions);

        if (result.allSecure) {
            // send encrypted if all secure
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnSecure;
            $scope.sendBtnSecure = true;
            $scope.showInvite = false;
        } else {
            // send plaintext
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnClear;
            $scope.sendBtnSecure = false;
        }
    };

    function checkSendStatusInternal(options) {
        let allSecure = true;
        let numReceivers = 0;

        // count number of receivers and check security
        options.to.forEach(check);
        options.cc.forEach(check);
        options.bcc.forEach(check);

        function check(recipient) {
            // validate address
            if (!util.validateEmailAddress(recipient.address)) {
                return dialog.info({
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
            $scope.showInvite = false;
            return {
                allSecure: false,
                numReceivers: numReceivers
            };
        }

        // bcc automatically disables secure sending
        if (options.bcc.filter(options.filterEmptyAddresses).length > 0) {
            allSecure = false;
        }

        return {
            allSecure: allSecure,
            numReceivers: numReceivers
        };
    }

    //
    // Editing attachments
    //

    $scope.remove = function(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const inviteOptions = {
            sender: auth.emailAddress,
            to: $scope.to,
            cc: $scope.cc,
            bcc: $scope.bcc,
            invited: $scope.invited,
            createMail: invitation.createMail,
            invite: invitation.invite,
            outbox: outbox,
            showInvite: $scope.showInvite
        };

        $scope.showInvite = false;

        // get recipients with no keys
        const invitees = getInvitees(inviteOptions);

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            const sendJobs = [];

            invitees.forEach(function(recipientAddress) {
                const invitationMail = inviteOptions.createMail({
                    sender: inviteOptions.sender,
                    recipient: recipientAddress
                });
                // send invitation mail
                const promise = inviteOptions.outbox.put(invitationMail).then(function() {
                    return inviteOptions.invite({
                        recipient: recipientAddress,
                        sender: inviteOptions.sender
                    });
                });
                sendJobs.push(promise);
                // remember already invited users to prevent spamming
                $scope.invited.push(recipientAddress);
            });

            return Promise.all(sendJobs);

        }).catch(function(err) {
            $scope.showInvite = true;
            return dialog.error(err);
        });
    };

    function getInvitees(options) {
        const invitees = [];

        options.to.forEach(check);
        options.cc.forEach(check);
        options.bcc.forEach(check);

        function check(recipient) {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && options.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        }

        return invitees;
    }

    //
    // Editing email body
    //

    $scope.sendToOutbox = function() {
        const messageOptions = {
            auth: auth,
            str: str,
            to: $scope.to,
            cc: $scope.cc,
            bcc: $scope.bcc,
            subject: $scope.subject,
            body: $scope.body,
            attachments: $scope.attachments,
            inReplyTo: $scope.inReplyTo,
            references: $scope.references,
            currentFolder: currentFolder,
            replyTo: $scope.replyTo,
            status: status,
            outbox: outbox,
            filterEmptyAddresses: filterEmptyAddresses
        };

        const message = buildMessage(messageOptions);

        // close the writer
        $scope.state.writer.close();
        // close read mode after reply
        if (messageOptions.replyTo) {
            messageOptions.status.setReading(false);
        }

        // persist the email to disk for later sending
        return $q(function(resolve) {
            resolve();

        }).then(function() {
            return messageOptions.outbox.put(message);

        }).then(function() {
            // if we need to synchronize replyTo.answered = true to imap,
            // let's do that. otherwise, we're done
            if (!messageOptions.replyTo || messageOptions.replyTo.answered) {
                return;
            }

            messageOptions.replyTo.answered = true;
            return messageOptions.email.setFlags({
                folder: messageOptions.currentFolder(),
                message: messageOptions.replyTo
            });

        }).catch(function(err) {
            if (err.code !== 42) {
                dialog.error(err);
            }
        });
    };

    function buildMessage(options) {
        const message = {
            from: [{
                name: options.auth.realname,
                address: options.auth.emailAddress
            }],
            to: options.to.filter(options.filterEmptyAddresses),
            cc: options.cc.filter(options.filterEmptyAddresses),
            bcc: options.bcc.filter(options.filterEmptyAddresses),
            subject: options.subject.trim() ? options.subject.trim() : options.str.fallbackSubject, // Subject line, or the fallback subject, if nothing valid was entered
            body: options.body.trim(), // use parsed plaintext body
            attachments: options.attachments,
            sentDate: new Date(),
            headers: {}
        };

        if (options.inReplyTo) {
            message.headers['in-reply-to'] = '<' + options.inReplyTo + '>';
        }

        if (options.references && options.references.length) {
            message.headers.references = options.references.map(function(reference) {
                return '<' + reference + '>';
            }).join(' ');
        }

        return message;
    }

    //
    // Tag input & Autocomplete
    //

    $scope.tagStyle = function(recipient) {
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    $scope.lookupAddressBook = function(query) {
        return $q(function(resolve) {
            resolve();

        }).then(function() {
            if ($scope.addressBookCache) {
                return;
            }
            // populate address book cache
            return keychain.listLocalPublicKeys().then(function(keys) {
                $scope.addressBookCache = keys.map(function(key) {
                    const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                    return {
                        address: key.userId,
                        displayId: name + ' - ' + key.userId
                    };
                });
            });

        }).then(function() {
            // filter the address book cache
            return $scope.addressBookCache.filter(function(i) {
                return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
            });

        }).catch(dialog.error);
    };

    //
    // Helpers
    //

    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    /*
     * Visitor to filter out objects without an address property, i.e. empty addresses
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;
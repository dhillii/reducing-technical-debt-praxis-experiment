'use strict';

var util = require('crypto-lib').util;

//
// Controller
//

var WriteCtrl = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {

    var str = appConfig.string;
    var cfg = appConfig.config;

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
        var dump = '';
        var appender = {
            log: function(level, date, component, log) {
                dump += '[' + getLogLevelTag(level) + date.toISOString() + (component ? '[' + component + ']' : '') + ' ' + (log || '').toString();
                if (log && log.stack) {
                    dump += ' . Stack: ' + log.stack;
                }
                dump += '\n';
            }
        };
        axe.dump(appender);

        $scope.to = [{
            address: str.supportAddress
        }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
    }

    function getLogLevelTag(level) {
        if (level === axe.DEBUG) return '[DEBUG]';
        if (level === axe.INFO) return '[INFO]';
        if (level === axe.WARN) return '[WARN]';
        if (level === axe.ERROR) return '[ERROR]';
        return '[UNKNOWN]';
    }

    function fillFields(re, replyAll, forward) {
        if (!re) return;

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        var replyTo = getReplyToAddress(re);
        var sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        if (!forward) {
            populateRecipientsForReply(re, replyTo);
        } else {
            populateRecipientsForForward(re);
        }

        if (replyAll) {
            populateCCForReplyAll(re, replyTo);
        }

        populateSubject(forward, re.subject);
        populateBody(forward, re, replyTo, sentDate);
    }

    function getReplyToAddress(re) {
        return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
    }

    function populateRecipientsForReply(re, replyTo) {
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);

        $scope.references = (re.references || []).slice();
        if (re.id && $scope.references.indexOf(re.id) < 0) {
            $scope.references.push(re.id);
        }
        if (re.id) {
            $scope.inReplyTo = re.id;
        }
    }

    function populateCCForReplyAll(re, replyTo) {
        var me = auth.emailAddress;
        re.to.concat(re.cc).forEach(function(recipient) {
            if (recipient.address === me && replyTo !== me) return;
            $scope.cc.unshift({ address: recipient.address });
        });

        $scope.cc = _.uniq($scope.cc, function(recipient) {
            return recipient.address;
        });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    function populateRecipientsForForward(re) {
        $scope.attachments = re.attachments.slice();
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    function populateSubject(forward, subject) {
        if (forward) {
            $scope.subject = 'Fwd: ' + subject;
        } else {
            $scope.subject = subject ? 'Re: ' + subject.replace('Re: ', '') : '';
        }
    }

    function populateBody(forward, re, replyTo, sentDate) {
        var from = re.from[0].name || replyTo;
        var body = '';

        if (forward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + re.subject + '\n' +
                'To: ' + formatRecipients(re.to) + '\n' +
                (re.cc && re.cc.length ? 'Cc: ' + formatRecipients(re.cc) + '\n' : '') +
                '\n\n';
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (re.body) {
            body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
            $scope.body = body;
        }
    }

    function formatRecipients(array) {
        return array.map(function(to) {
            return ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
        }).join(', ');
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
        if (!recipient) return;

        normalizeRecipient(recipient);

        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        return $q(function(resolve) { resolve(); })
            .then(function() {
                return keychain.refreshKeyForUserId({ userId: recipient.address });
            })
            .then(function(key) {
                if (!key) {
                    $scope.showInvite = true;
                } else {
                    var userIds = pgp.getKeyParams(key.publicKey).userIds;
                    var matchingUserId = _.findWhere(userIds, { emailAddress: recipient.address });
                    if (matchingUserId) {
                        recipient.key = key;
                        recipient.secure = true;
                    } else {
                        $scope.showInvite = true;
                    }
                }
                $scope.checkSendStatus();
            })
            .catch(dialog.error);
    };

    function normalizeRecipient(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        var allSecure = true;
        var numReceivers = 0;

        [$scope.to, $scope.cc, $scope.bcc].forEach(function(list) {
            list.forEach(function(recipient) {
                if (!util.validateEmailAddress(recipient.address)) {
                    dialog.info({
                        title: 'Warning',
                        message: 'Invalid recipient address!'
                    });
                    return;
                }
                numReceivers++;
                if (!recipient.secure) allSecure = false;
            });
        });

        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            allSecure = false;
        }

        if (allSecure) {
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnSecure;
            $scope.sendBtnSecure = true;
            $scope.showInvite = false;
        } else {
            $scope.okToSend = true;
            $scope.sendBtnText = str.sendBtnClear;
            $scope.sendBtnSecure = false;
        }
    };

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
        var sender = auth.emailAddress;
        var sendJobs = [];
        var invitees = [];

        $scope.showInvite = false;

        [$scope.to, $scope.cc, $scope.bcc].forEach(function(list) {
            list.forEach(function(recipient) {
                if (util.validateEmailAddress(recipient.address) &&
                    !recipient.secure &&
                    $scope.invited.indexOf(recipient.address) === -1) {
                    invitees.push(recipient.address);
                }
            });
        });

        return $q(function(resolve) { resolve(); })
            .then(function() {
                invitees.forEach(function(recipientAddress) {
                    var invitationMail = invitation.createMail({
                        sender: sender,
                        recipient: recipientAddress
                    });
                    var promise = outbox.put(invitationMail)
                        .then(function() {
                            return invitation.invite({
                                recipient: recipientAddress,
                                sender: sender
                            });
                        });
                    sendJobs.push(promise);
                    $scope.invited.push(recipientAddress);
                });

                return Promise.all(sendJobs);
            })
            .catch(function(err) {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    };

    //
    // Editing email body
    //

    $scope.sendToOutbox = function() {
        var message = buildOutgoingMessage();

        if ($scope.inReplyTo) {
            message.headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }

        if ($scope.references && $scope.references.length) {
            message.headers.references = $scope.references.map(function(reference) {
                return '<' + reference + '>';
            }).join(' ');
        }

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q(function(resolve) { resolve(); })
            .then(function() {
                return outbox.put(message);
            })
            .then(function() {
                if (!$scope.replyTo || $scope.replyTo.answered) return;

                $scope.replyTo.answered = true;
                return email.setFlags({
                    folder: currentFolder(),
                    message: $scope.replyTo
                });
            })
            .catch(function(err) {
                if (err.code !== 42) dialog.error(err);
            });
    };

    function buildOutgoingMessage() {
        return {
            from: [{
                name: auth.realname,
                address: auth.emailAddress
            }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject: $scope.subject.trim() || str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: {}
        };
    }

    //
    // Tag input & Autocomplete
    //

    $scope.tagStyle = function(recipient) {
        var classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    $scope.lookupAddressBook = function(query) {
        return $q(function(resolve) { resolve(); })
            .then(function() {
                if ($scope.addressBookCache) return;
                return keychain.listLocalPublicKeys().then(function(keys) {
                    $scope.addressBookCache = keys.map(function(key) {
                        var name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                        return {
                            address: key.userId,
                            displayId: name + ' - ' + key.userId
                        };
                    });
                });
            })
            .then(function() {
                if (!$scope.addressBookCache) return [];
                return $scope.addressBookCache.filter(function(i) {
                    return i.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
                });
            })
            .catch(dialog.error);
    };

    //
    // Helpers
    //

    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    /**
     * Visitor to filter out objects without an address property, i.e. empty addresses
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;
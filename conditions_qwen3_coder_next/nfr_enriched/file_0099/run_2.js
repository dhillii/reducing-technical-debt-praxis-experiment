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

            fillFieldsFromMessage(replyTo, replyAll, forward);

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
        var dump = buildLogDump();
        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion) + dump;
    }

    function buildLogDump() {
        var dump = '';
        var appender = {
            log: function(level, date, component, log) {
                dump += mapLogLevelToTag(level);
                dump += '[' + date.toISOString() + ']';
                if (component) {
                    dump += '[' + component + ']';
                }
                dump += ' ' + (log || '').toString();
                if (log && log.stack) {
                    dump += ' . Stack: ' + log.stack;
                }
                dump += '\n';
            }
        };
        axe.dump(appender);
        return dump;
    }

    function mapLogLevelToTag(level) {
        if (level === axe.DEBUG) return '[DEBUG]';
        if (level === axe.INFO) return '[INFO]';
        if (level === axe.WARN) return '[WARN]';
        if (level === axe.ERROR) return '[ERROR]';
        return '';
    }

    function fillFieldsFromMessage(re, replyAll, forward) {
        var replyTo, from, sentDate, body;

        if (!re) return;

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        replyTo = getReplyToAddress(re);

        if (!forward) {
            fillRecipientFieldsForReply(re, replyTo);
            if (replyAll) {
                fillCCFieldsForReplyAll(re, replyTo);
            }
        } else {
            fillFieldsForForward(re);
        }

        fillSubjectField(re, forward);
        from = re.from[0].name || replyTo;
        sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        fillBodyField(re, from, sentDate, forward);
    }

    function getReplyToAddress(re) {
        return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
    }

    function fillRecipientFieldsForReply(re, replyTo) {
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

    function fillCCFieldsForReplyAll(re, replyTo) {
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

    function fillFieldsForForward(re) {
        $scope.attachments = re.attachments.slice();
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    function fillSubjectField(re, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject
                ? 'Re: ' + re.subject.replace('Re: ', '')
                : '';
        }
    }

    function fillBodyField(re, from, sentDate, forward) {
        var body;
        if (forward) {
            body = build ForwardedBody(re, sentDate);
        } else {
            body = buildRepliedBody(re, from, sentDate);
        }
        if (re.body) {
            body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }
        $scope.body = body;
    }

    function build ForwardedBody(re, sentDate) {
        function createString(array) {
            return array.reduce(function(str, to) {
                return str + (str ? ', ' : '') +
                    ((to.name ? to.name : to.address) + ' <' + to.address + '>');
            }, '');
        }

        return '\n\n' +
            '---------- Forwarded message ----------\n' +
            'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
            'Date: ' + sentDate + '\n' +
            'Subject: ' + re.subject + '\n' +
            'To: ' + createString(re.to) + '\n' +
            (re.cc && re.cc.length > 0 ? 'Cc: ' + createString(re.cc) + '\n' : '') +
            '\n\n';
    }

    function buildRepliedBody(re, from, sentDate) {
        return '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
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
     * Normalize and verify a recipient, fetch their PGP key
     */
    $scope.verify = function(recipient) {
        if (!recipient) return;

        normalizeRecipientDisplayId(recipient);

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
                if (key) {
                    verifyAndAssignKey(recipient, key);
                } else {
                    $scope.showInvite = true;
                }
                $scope.checkSendStatus();
            })
            .catch(dialog.error);
    };

    function normalizeRecipientDisplayId(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    function verifyAndAssignKey(recipient, key) {
        var userIds = pgp.getKeyParams(key.publicKey).userIds;
        var matchingUserId = _.findWhere(userIds, {
            emailAddress: recipient.address
        });
        if (matchingUserId) {
            recipient.key = key;
            recipient.secure = true;
        }
    }

    /**
     * Validate recipients and determine if secure sending is possible
     */
    $scope.checkSendStatus = function() {
        var status = {
            okToSend: false,
            numReceivers: 0,
            allSecure: true
        };

        collectReceiversStatus(status);

        if (status.numReceivers < 1) {
            $scope.showInvite = false;
            $scope.okToSend = false;
            return;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            status.allSecure = false;
        }

        applySendStatus(status);
    };

    function collectReceiversStatus(status) {
        [$scope.to, $scope.cc, $scope.bcc].forEach(function(list) {
            list.forEach(function(recipient) {
                if (!util.validateEmailAddress(recipient.address)) {
                    dialog.info({
                        title: 'Warning',
                        message: 'Invalid recipient address!'
                    });
                    return;
                }
                status.numReceivers++;
                if (!recipient.secure) status.allSecure = false;
            });
        });
    }

    function applySendStatus(status) {
        $scope.okToSend = true;
        if (status.allSecure) {
            $scope.sendBtnText = str.sendBtnSecure;
            $scope.sendBtnSecure = true;
            $scope.showInvite = false;
        } else {
            $scope.sendBtnText = str.sendBtnClear;
            $scope.sendBtnSecure = false;
        }
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
        var sender = auth.emailAddress;
        var invitees = collectInvitees();
        $scope.showInvite = false;

        return $q(function(resolve) { resolve(); })
            .then(function() {
                var sendJobs = invitees.map(function(recipientAddress) {
                    return sendInvitationTo(recipientAddress, sender);
                });
                return Promise.all(sendJobs);
            })
            .catch(function(err) {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    };

    function collectInvitees() {
        var invitees = [];
        [$scope.to, $scope.cc, $scope.bcc].forEach(function(list) {
            list.forEach(function(recipient) {
                if (!util.validateEmailAddress(recipient.address) ||
                    recipient.secure ||
                    $scope.invited.indexOf(recipient.address) !== -1) return;
                    invitees.push(recipient.address);
            });
        });
        return invitees;
    }

    function sendInvitationTo(recipientAddress, sender) {
        var invitationMail = invitation.createMail({
            sender: sender,
            recipient: recipientAddress
        });
        return outbox.put(invitationMail)
            .then(function() {
                return invitation.invite({
                    recipient: recipientAddress,
                    sender: sender
                });
            })
            .then(function() {
                $scope.invited.push(recipientAddress);
            });
    }

    //
    // Editing email body
    //

    $scope.sendToOutbox = function() {
        var message = buildOutgoingEmailMessage();

        if ($scope.inReplyTo) {
            message.headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }

        if ($scope.references && $scope.references.length) {
            message.headers.references = $scope.references
                .map(function(ref) { return '<' + ref + '>'; })
                .join(' ');
        }

        $scope.state.writer.close();
        if ($scope.replyTo) status.setReading(false);

        return $q(function(resolve) { resolve(); })
            .then(function() { return outbox.put(message); })
            .then(function() { return maybeMarkReplyAsAnswered(); })
            .catch(function(err) {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    };

    function buildOutgoingEmailMessage() {
        return {
            from: [{ name: auth.realname, address: auth.emailAddress }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject: ($scope.subject && $scope.subject.trim()) || str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: {}
        };
    }

    function maybeMarkReplyAsAnswered() {
        if (!$scope.replyTo || $scope.replyTo.answered) return;
        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    //
    // Tag input & Autocomplete
    //

    $scope.tagStyle = function(recipient) {
        return recipient.secure === false ? ['label', 'label--invalid'] : ['label'];
    };

    $scope.lookupAddressBook = function(query) {
        if (!$scope.addressBookCache) return fetchAndCacheAddressBook().then(function() {
            return filterAddressBookForQuery(query);
        });
        return $q(function(resolve) { resolve(); })
            .then(function() { return filterAddressBookForQuery(query); });
    };

    function fetchAndCacheAddressBook() {
        return keychain.listLocalPublicKeys()
            .then(function(keys) {
                $scope.addressBookCache = keys.map(function(key) {
                    var name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                    return {
                        address: key.userId,
                        displayId: name + ' - ' + key.userId
                    };
                });
            });
    }

    function filterAddressBookForQuery(query) {
        var lowerQuery = query.toLowerCase();
        return $scope.addressBookCache
            .filter(function(item) { return item.displayId.toLowerCase().indexOf(lowerQuery) !== -1; });
    }

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
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
    // Initialization
    //

    $scope.state.writer = {
        write: function(replyTo, replyAll, forward) {
            $scope.state.lightbox = 'write';
            $scope.replyTo = replyTo;

            resetFields();

            fillEmailFields(replyTo, replyAll, forward);

            $scope.verify($scope.to[0]);
        },
        reportBug: function() {
            $scope.state.lightbox = 'write';
            resetFields();
            populateBugReportFields();
            $scope.verify($scope.to[0]);
        },
        close: function() {
            $scope.state.lightbox = undefined;
        }
    };

    /**
     * Resets writer form fields to initial empty state.
     */
    function resetFields() {
        $scope.writerTitle = 'New email';
        $scope.to = [];
        $scope.cc = [];
        $scope.bcc = [];
        $scope.showCC = false;
        $scope.showBCC = false;
        $scope.subject = '';
        $scope.body = '';
        $scope.attachments = [];
        $scope.addressBookCache = undefined;
        $scope.showInvite = undefined;
        $scope.invited = [];
    }

    /**
     * Populates writer fields with bug report details.
     */
    function populateBugReportFields() {
        var dump = captureAppLogs();

        $scope.to = [{ address: str.supportAddress }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion) + dump;
    }

    /**
     * Captures application logs for inclusion in bug reports.
     */
    function captureAppLogs() {
        var dump = '';
        var appender = {
            log: function(level, date, component, log) {
                dump += logLevelPrefix(level);
                dump += '[' + date.toISOString() + ']';
                if (component) dump += '[' + component + ']';
                dump += ' ' + (log || '').toString();
                if (log && log.stack) dump += ' . Stack: ' + log.stack;
                dump += '\n';
            }
        };
        axe.dump(appender);
        return dump;
    }

    /**
     * Returns log level prefix string based on level.
     */
    function logLevelPrefix(level) {
        if (level === axe.DEBUG) return '[DEBUG]';
        if (level === axe.INFO) return '[INFO]';
        if (level === axe.WARN) return '[WARN]';
        if (level === axe.ERROR) return '[ERROR]';
        return '';
    }

    /**
     * Populates email fields based on the type of composition (reply/forward).
     */
    function fillEmailFields(re, replyAll, forward) {
        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        var replyTo = getReplyToAddress(re);

        if (!forward) {
            populateReplyFields(re, replyTo);
        }
        if (replyAll) {
            populateReplyAllFields(re, replyTo);
        }
        if (forward) {
            populateForwardFields(re);
        }

        updateSubject(forward, re.subject);
        populateBody(forward, re, replyTo);
    }

    /**
     * Extracts the reply-to address from message envelope.
     */
    function getReplyToAddress(re) {
        return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
    }

    /**
     * Populates fields for reply scenarios (non-forward).
     */
    function populateReplyFields(re, replyTo) {
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);
        $scope.references = (re.references || []).concat(re.id ? [re.id] : []);
        if (re.id) {
            $scope.inReplyTo = re.id;
        }
    }

    /**
     * Populates CC field for reply-all scenarios.
     */
    function populateReplyAllFields(re, replyTo) {
        var me = auth.emailAddress;
        var recipients = re.to.concat(re.cc);
        recipients.forEach(function(recipient) {
            if (recipient.address === me && replyTo !== me) {
                return;
            }
            $scope.cc.unshift({ address: recipient.address });
        });

        $scope.cc = _.uniq($scope.cc, function(recipient) { return recipient.address; });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /**
     * Populates fields for forward scenarios.
     */
    function populateForwardFields(re) {
        $scope.attachments = re.attachments.slice();
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    /**
     * Updates subject line based on composition type.
     */
    function updateSubject(forward, subject) {
        if (forward) {
            $scope.subject = 'Fwd: ' + subject;
        } else {
            $scope.subject = subject ? 'Re: ' + subject.replace(/^Re:\s*/i, '') : '';
        }
    }

    /**
     * Constructs message body content for reply or forward.
     */
    function populateBody(forward, re, replyTo) {
        var from = re.from[0].name || replyTo;
        var sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        if (forward) {
            $scope.body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + re.subject + '\n' +
                'To: ' + formatRecipientList(re.to) + '\n' +
                ((re.cc && re.cc.length) ? 'Cc: ' + formatRecipientList(re.cc) + '\n' : '') +
                '\n\n';

        } else {
            $scope.body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (re.body) {
            $scope.body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }
    }

    /**
     * Formats an array of recipients into a human-readable string.
     */
    function formatRecipientList(recipients) {
        return recipients.map(function(to) {
            return (to.name ? to.name : to.address) + ' <' + to.address + '>';
        }).join(', ');
    }

    //
    // Header editing
    //

    /**
     * Handles BCC toggle with user warning.
     */
    $scope.toggleShowBCC = function() {
        $scope.showBCC = true;
        return dialog.info({
            title: 'Warning',
            message: 'Cannot send encrypted messages with BCC!'
        });
    };

    /**
     * Verifies recipient and fetches/public key.
     */
    $scope.verify = function(recipient) {
        if (!recipient) return;

        prepareRecipientDisplayId(recipient);
        recipient.secure = false;
        recipient.key = undefined;
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        resolveKeyForRecipient(recipient);
    };

    /**
     * Normalizes recipient address and display ID.
     */
    function prepareRecipientDisplayId(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    /**
     * Fetches public key for recipient and updates security status.
     */
    function resolveKeyForRecipient(recipient) {
        $q(function(resolve) { resolve(); })
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
    }

    /**
     * Validates all recipients and sets sendability indicators.
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        var numReceivers = 0;
        var allSecure = true;

        collectRecipientStatus($scope.to, numReceivers, allSecure);
        collectRecipientStatus($scope.cc, numReceivers, allSecure);
        collectRecipientStatus($scope.bcc, numReceivers, allSecure);

        function collectRecipientStatus(addresses, count, secure) {
            addresses.forEach(function(recipient) {
                if (!util.validateEmailAddress(recipient.address)) {
                    dialog.info({
                        title: 'Warning',
                        message: 'Invalid recipient address!'
                    });
                    return;
                }
                count++;
                if (!recipient.secure) secure = false;
            });
        }

        if ($scope.to.length + $scope.cc.length + $scope.bcc.length === 0) {
            $scope.showInvite = false;
            return;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            allSecure = false;
        }

        $scope.okToSend = true;
        $scope.sendBtnText = allSecure ? str.sendBtnSecure : str.sendBtnClear;
        $scope.sendBtnSecure = allSecure;
        $scope.showInvite = !allSecure;
    };

    //
    // Attachment handling
    //

    $scope.remove = function(attachment) {
        var index = $scope.attachments.indexOf(attachment);
        if (index !== -1) {
            $scope.attachments.splice(index, 1);
        }
    };

    /**
     * Sends invitations to all recipients missing public keys.
     */
    $scope.invite = function() {
        var sender = auth.emailAddress;
        var invitees = [];

        $scope.showInvite = false;

        gatherInvitationCandidates($scope.to, invitees);
        gatherInvitationCandidates($scope.cc, invitees);
        gatherInvitationCandidates($scope.bcc, invitees);

        function gatherInvitationCandidates(addresses, inviteesList) {
            addresses.forEach(function(recipient) {
                if (util.validateEmailAddress(recipient.address) &&
                    !recipient.secure &&
                    $scope.invited.indexOf(recipient.address) === -1) {
                    inviteesList.push(recipient.address);
                }
            });
        }

        return $q(function(resolve) { resolve(); })
            .then(function() {
                return Promise.all(invitees.map(function(recipientAddress) {
                    return sendInvitation(recipientAddress, sender);
                }));
            })
            .catch(function(err) {
                $scope.showInvite = true;
                return dialog.error(err);
            });
    };

    /**
     * Sends invitation for given recipient and records it.
     */
    function sendInvitation(recipientAddress, sender) {
        var invitationMail = invitation.createMail({
            sender: sender,
            recipient: recipientAddress
        });

        return outbox.put(invitationMail).then(function() {
            return invitation.invite({
                recipient: recipientAddress,
                sender: sender
            });
        }).then(function() {
            $scope.invited.push(recipientAddress);
        });
    }

    //
    // Email submission
    //

    /**
     * Writes email to outbox for later delivery.
     */
    $scope.sendToOutbox = function() {
        var message = buildEmailMessage();

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q(function(resolve) { resolve(); })
            .then(function() {
                return outbox.put(message);
            })
            .then(function() {
                return handleReplyMarking();
            })
            .catch(function(err) {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    };

    /**
     * Constructs message object from current form state.
     */
    function buildEmailMessage() {
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
            headers: buildAdditionalHeaders()
        };
    }

    /**
     * Builds SMTP headers for in-reply-to and references.
     */
    function buildAdditionalHeaders() {
        var headers = {};
        if ($scope.inReplyTo) {
            headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }
        if ($scope.references && $scope.references.length) {
            headers.references = $scope.references.map(function(ref) {
                return '<' + ref + '>';
            }).join(' ');
        }
        return headers;
    }

    /**
     * Updates message flags to mark original message as replied.
     */
    function handleReplyMarking() {
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return;
        }

        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: getCurrentFolder(),
            message: $scope.replyTo
        });
    }

    /**
     * Retrieves current folder from navigation state.
     */
    function getCurrentFolder() {
        return $scope.state.nav.currentFolder;
    }

    //
    // UI Helpers
    //

    /**
     * Returns CSS class string for recipient tag styling.
     */
    $scope.tagStyle = function(recipient) {
        var classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    /**
     * Looks up addresses from local address book with fuzzy matching.
     */
    $scope.lookupAddressBook = function(query) {
        return $q(function(resolve) { resolve(); })
            .then(function() {
                if (!$scope.addressBookCache) {
                    return keychain.listLocalPublicKeys().then(function(keys) {
                        $scope.addressBookCache = keys.map(function(key) {
                            var name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                            return {
                                address: key.userId,
                                displayId: name + ' - ' + key.userId
                            };
                        });
                    });
                }
                return null;
            })
            .then(function() {
                return ($scope.addressBookCache || []).filter(function(item) {
                    return item.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
                });
            })
            .catch(dialog.error);
    };

    //
    // Utility functions
    //

    /**
     * Filters out address objects that lack valid address property.
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;
'use strict';

var util = require('crypto-lib').util;

//
// Helper types (local)
//

/**
 * @typedef {Object} RecipientItem
 * @property {string} address - Email address
 * @property {string} [name] - Optional display name
 */

/**
 * @typedef {Object} EmailEnvelope
 * @property {RecipientItem[]} from
 * @property {RecipientItem[]} to
 * @property {RecipientItem[]} cc
 * @property {RecipientItem[]} bcc
 * @property {string} subject
 * @property {string} body
 * @property {Object[]} attachments
 * @property {Date} sentDate
 * @property {Object} headers
 */

/**
 * @typedef {Object} FillFieldsParams
 * @property {Object} re - Original message
 * @property {boolean} replyAll - Include CC recipients
 * @property {boolean} forward - Forward instead of reply
 */

/**
 * @typedef {Object} CheckRecipientParams
 * @property {RecipientItem} recipient
 * @property {number[]} counts - [numReceivers, 0-based]
 * @property {boolean[]} flags - [allSecure, 0-based]
 */

/**
 * @typedef {Object} InvitePreparationParams
 * @property {string} sender
 * @property {string} [recipientAddress]
 */

/**
 * @typedef {Object} FillAndVerifyParams
 * @property {string} address
 * @property {RecipientItem} recipient
 */

/**
 * @typedef {Object} SendParams
 * @property {Object} re - Original message (if reply/forward)
 * @property {boolean} replyAll
 * @property {boolean} forward
 */

/**
 * @typedef {Object} KeychainOptions
 * @property {string} userId
 */

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

            fillFieldsAndVerify({
                re: replyTo,
                replyAll: replyAll,
                forward: forward
            });

            $scope.verify({ address: $scope.to[0]?.address });
        },
        reportBug: function() {
            $scope.state.lightbox = 'write';
            resetFields();
            reportBug();
            $scope.verify({ address: $scope.to[0]?.address });
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

                if (component) {
                    dump += '[' + component + ']';
                }

                dump += ' ' + (log || '').toString();

                if (log.stack) {
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

    /**
     * Fills composer fields based on replyTo, replyAll, and forward flags.
     * Extracted for parameter count control.
     * @param {FillFieldsParams} params - Reply/forward context
     */
    function fillFieldsAndVerify(params) {
        var re = params.re;
        var replyAll = params.replyAll;
        var forward = params.forward;

        if (!re) {
            return;
        }

        $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

        var replyTo = re.replyTo && re.replyTo[0] && re.replyTo[0].address || re.from[0].address;

        if (!forward) {
            $scope.to.unshift({
                address: replyTo
            });
            $scope.to.forEach(function(r) {
                $scope.verify(r);
            });

            $scope.references = (re.references || []);
            if (re.id && $scope.references.indexOf(re.id) < 0) {
                $scope.references = $scope.references.concat(re.id);
            }
            if (re.id) {
                $scope.inReplyTo = re.id;
            }
        }

        if (replyAll) {
            re.to.concat(re.cc).forEach(function(recipient) {
                var me = auth.emailAddress;
                if (recipient.address === me && replyTo !== me) {
                    return;
                }
                $scope.cc.unshift({
                    address: recipient.address
                });
            });

            $scope.cc = _.uniq($scope.cc, function(recipient) {
                return recipient.address;
            });
            $scope.showCC = true;
            $scope.cc.forEach(function(r) {
                $scope.verify(r);
            });
        }

        // fill attachments and references on forward
        if (forward) {
            $scope.attachments = [].concat(re.attachments);
            if (re.id) {
                $scope.references = [re.id];
            }
        }

        // fill subject
        if (forward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }

        // fill text body
        var from = re.from[0].name || replyTo;
        var sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        function createString(array) {
            var str = '';
            array.forEach(function(to) {
                str += (str) ? ', ' : '';
                str += ((to.name) ? to.name : to.address) + ' <' + to.address + '>';
            });
            return str;
        }

        var body = '';

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
            $scope.body = body;
        }
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
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }

        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            return keychain.refreshKeyForUserId({
                userId: recipient.address
            });

        }).then(function(key) {
            if (key) {
                var userIds = pgp.getKeyParams(key.publicKey).userIds;
                var matchingUserId = _.findWhere(userIds, {
                    emailAddress: recipient.address
                });
                if (matchingUserId) {
                    recipient.key = key;
                    recipient.secure = true;
                }
            } else {
                $scope.showInvite = true;
            }
            $scope.checkSendStatus();

        }).catch(dialog.error);
    };

    /**
     * Check if it is ok to send an email depending on invitation state and security
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        var counts = [0];
        var flags = [true];

        $scope.to.forEach(function(r) {
            checkRecipient({
                recipient: r,
                counts: counts,
                flags: flags
            });
        });
        $scope.cc.forEach(function(r) {
            checkRecipient({
                recipient: r,
                counts: counts,
                flags: flags
            });
        });
        $scope.bcc.forEach(function(r) {
            checkRecipient({
                recipient: r,
                counts: counts,
                flags: flags
            });
        });

        if (counts[0] < 1) {
            $scope.showInvite = false;
            return;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            flags[0] = false;
        }

        if (flags[0]) {
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

    /**
     * Checks a single recipient for validity and security state.
     * @param {CheckRecipientParams} param
     */
    function checkRecipient(param) {
        var recipient = param.recipient;
        var counts = param.counts;
        var flags = param.flags;

        if (!util.validateEmailAddress(recipient.address)) {
            dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
            return;
        }
        counts[0]++;
        if (!recipient.secure) {
            flags[0] = false;
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
        var sendJobs = [];
        var invitees = [];

        $scope.showInvite = false;

        $scope.to.forEach(getInvitee);
        $scope.cc.forEach(getInvitee);
        $scope.bcc.forEach(getInvitee);

        function getInvitee(recipient) {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        }

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            invitees.forEach(function(recipientAddress) {
                var invitationMail = invitation.createMail({
                    sender: sender,
                    recipient: recipientAddress
                });
                var promise = outbox.put(invitationMail).then(function() {
                    return invitation.invite({
                        recipient: recipientAddress,
                        sender: sender
                    });
                });
                sendJobs.push(promise);
                $scope.invited.push(recipientAddress);
            });

            return Promise.all(sendJobs);

        }).catch(function(err) {
            $scope.showInvite = true;
            return dialog.error(err);
        });
    };

    //
    // Editing email body
    //

    /**
     * Submits current composer state to outbox
     */
    $scope.sendToOutbox = function() {
        var message = {
            from: [{
                name: auth.realname,
                address: auth.emailAddress
            }],
            to: $scope.to.filter(filterEmptyAddresses),
            cc: $scope.cc.filter(filterEmptyAddresses),
            bcc: $scope.bcc.filter(filterEmptyAddresses),
            subject: $scope.subject.trim() ? $scope.subject.trim() : str.fallbackSubject,
            body: $scope.body.trim(),
            attachments: $scope.attachments,
            sentDate: new Date(),
            headers: {}
        };

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

        return $q(function(resolve) {
            resolve();

        }).then(function() {
            return outbox.put(message);

        }).then(function() {
            if (!$scope.replyTo || $scope.replyTo.answered) {
                return;
            }

            $scope.replyTo.answered = true;
            return email.setFlags({
                folder: currentFolder(),
                message: $scope.replyTo
            });

        }).catch(function(err) {
            if (err.code !== 42) {
                dialog.error(err);
            }
        });
    };

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
        return $q(function(resolve) {
            resolve();

        }).then(function() {
            if ($scope.addressBookCache) {
                return;
            }
            return keychain.listLocalPublicKeys().then(function(keys) {
                $scope.addressBookCache = keys.map(function(key) {
                    var name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                    return {
                        address: key.userId,
                        displayId: name + ' - ' + key.userId
                    };
                });
            });

        }).then(function() {
            if (!$scope.addressBookCache) {
                return [];
            }
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

    /**
     * Visitor to filter out objects without an address property
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;
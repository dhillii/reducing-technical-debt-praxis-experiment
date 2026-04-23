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

    // Formats a log level to its string representation
    function formatLogLevel(level) {
        if (level === axe.DEBUG) {
            return '[DEBUG]';
        } else if (level === axe.INFO) {
            return '[INFO]';
        } else if (level === axe.WARN) {
            return '[WARN]';
        } else if (level === axe.ERROR) {
            return '[ERROR]';
        }
        return '';
    }

    // Formats a single log entry with timestamp and component
    function formatLogEntry(level, date, component, log) {
        let entry = formatLogLevel(level);
        entry += '[' + date.toISOString() + ']';

        if (component) {
            entry += '[' + component + ']';
        }

        entry += ' ' + (log || '').toString();

        if (log.stack) {
            entry += ' . Stack: ' + log.stack;
        }

        return entry + '\n';
    }

    function reportBug() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                dump += formatLogEntry(level, date, component, log);
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

    // Extracts the reply-to address from email metadata
    function extractReplyToAddress(email) {
        return email.replyTo && email.replyTo[0] && email.replyTo[0].address || email.from[0].address;
    }

    // Handles reply/reply-all recipient setup
    function setupReplyRecipients(email, replyTo, replyAll) {
        $scope.to.unshift({
            address: replyTo
        });
        $scope.to.forEach($scope.verify);

        $scope.references = (email.references || []);
        if (email.id && $scope.references.indexOf(email.id) < 0) {
            $scope.references = $scope.references.concat(email.id);
        }
        if (email.id) {
            $scope.inReplyTo = email.id;
        }

        if (replyAll) {
            setupReplyAllCc(email, replyTo);
        }
    }

    // Handles CC field setup for reply-all
    function setupReplyAllCc(email, replyTo) {
        const me = auth.emailAddress;
        email.to.concat(email.cc).forEach(function(recipient) {
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
        $scope.cc.forEach($scope.verify);
    }

    // Handles forward-specific field setup
    function setupForwardFields(email) {
        $scope.attachments = [].concat(email.attachments);
        if (email.id) {
            $scope.references = [email.id];
        }
    }

    // Formats the subject line for reply or forward
    function formatSubjectLine(email, forward) {
        if (forward) {
            return 'Fwd: ' + email.subject;
        } else {
            return email.subject ? 'Re: ' + email.subject.replace('Re: ', '') : '';
        }
    }

    // Converts an array of recipients to a formatted string
    function createRecipientString(recipients) {
        let str = '';
        recipients.forEach(function(recipient) {
            str += (str) ? ', ' : '';
            str += ((recipient.name) ? recipient.name : recipient.address) + ' <' + recipient.address + '>';
        });
        return str;
    }

    // Builds the quoted body text for reply or forward
    function buildQuotedBody(email, forward, from, sentDate) {
        let body;

        if (forward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + email.from[0].name + ' <' + email.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + email.subject + '\n' +
                'To: ' + createRecipientString(email.to) + '\n' +
                ((email.cc && email.cc.length > 0) ? 'Cc: ' + createRecipientString(email.cc) + '\n' : '') +
                '\n\n';
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (email.body) {
            body += email.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }

        return body;
    }

    function fillFields(re, replyAll, forward) {
        if (!re) {
            return;
        }

        $scope.writerTitle = (forward) ? 'Forward' : 'Reply';

        const replyTo = extractReplyToAddress(re);

        if (!forward) {
            setupReplyRecipients(re, replyTo, replyAll);
        }

        if (forward) {
            setupForwardFields(re);
        }

        $scope.subject = formatSubjectLine(re, forward);

        const from = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        $scope.body = buildQuotedBody(re, forward, from, sentDate);
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

    // Checks if a key exists for the recipient and updates secure status
    function checkRecipientKey(recipient) {
        return keychain.refreshKeyForUserId({
            userId: recipient.address
        }).then(function(key) {
            if (key) {
                const userIds = pgp.getKeyParams(key.publicKey).userIds;
                const matchingUserId = _.findWhere(userIds, {
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
    }

    // Validates and normalizes recipient address format
    function normalizeRecipientAddress(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    /**
     * Verify email address and fetch its public key
     */
    $scope.verify = function(recipient) {
        if (!recipient) {
            return;
        }

        normalizeRecipientAddress(recipient);

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
            return checkRecipientKey(recipient);
        });
    };

    // Validates a single recipient address
    function validateRecipient(recipient) {
        if (!util.validateEmailAddress(recipient.address)) {
            return dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        return true;
    }

    // Counts receivers and checks overall security status
    function analyzeRecipients() {
        let allSecure = true;
        let numReceivers = 0;

        const checkRecipient = function(recipient) {
            if (!validateRecipient(recipient)) {
                return;
            }
            numReceivers++;
            if (!recipient.secure) {
                allSecure = false;
            }
        };

        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        return {
            allSecure: allSecure,
            numReceivers: numReceivers
        };
    }

    // Updates send button state based on security and recipient status
    function updateSendButtonState(analysis) {
        if (analysis.numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        let allSecure = analysis.allSecure;

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
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        const analysis = analyzeRecipients();
        updateSendButtonState(analysis);
    };

    //
    // Editing attachments
    //

    $scope.remove = function(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    // Collects all recipients without valid keys
    function collectInvitees() {
        const invitees = [];

        const checkRecipient = function(recipient) {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        return invitees;
    }

    // Sends invitation mail and tracks invitation
    function sendInvitationForRecipient(recipientAddress, sender) {
        const invitationMail = invitation.createMail({
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

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const sender = auth.emailAddress;
        const invitees = collectInvitees();

        $scope.showInvite = false;

        if (invitees.length === 0) {
            return Promise.resolve();
        }

        return $q(function(resolve) {
            resolve();
        }).then(function() {
            const sendJobs = invitees.map(function(recipientAddress) {
                return sendInvitationForRecipient(recipientAddress, sender);
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

    // Builds the message object for outbox storage
    function buildMessage() {
        const message = {
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

        return message;
    }

    // Marks the original email as answered if needed
    function markOriginalAsAnswered() {
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return Promise.resolve();
        }

        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    $scope.sendToOutbox = function() {
        const message = buildMessage();

        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }

        return $q(function(resolve) {
            resolve();
        }).then(function() {
            return outbox.put(message);
        }).then(function() {
            return markOriginalAsAnswered();
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
        const classes = ['label'];
        if (recipient.secure === false) {
            classes.push('label--invalid');
        }
        return classes;
    };

    // Populates the address book cache from local public keys
    function populateAddressBookCache() {
        return keychain.listLocalPublicKeys().then(function(keys) {
            $scope.addressBookCache = keys.map(function(key) {
                const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                return {
                    address: key.userId,
                    displayId: name + ' - ' + key.userId
                };
            });
        });
    }

    // Filters address book cache by query string
    function filterAddressBook(query) {
        return $scope.addressBookCache.filter(function(entry) {
            return entry.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
    }

    $scope.lookupAddressBook = function(query) {
        return $q(function(resolve) {
            resolve();
        }).then(function() {
            if ($scope.addressBookCache) {
                return;
            }
            return populateAddressBookCache();
        }).then(function() {
            return filterAddressBook(query);
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
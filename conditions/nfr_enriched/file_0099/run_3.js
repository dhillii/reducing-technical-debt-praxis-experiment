```javascript
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

    /**
     * Reset all composer fields to initial state
     */
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

    /**
     * Format a single log entry with level, timestamp, component, and message
     */
    function formatLogEntry(level, date, component, log) {
        let entry = '';

        // add a tag for the log level
        if (level === axe.DEBUG) {
            entry += '[DEBUG]';
        } else if (level === axe.INFO) {
            entry += '[INFO]';
        } else if (level === axe.WARN) {
            entry += '[WARN]';
        } else if (level === axe.ERROR) {
            entry += '[ERROR]';
        }

        entry += '[' + date.toISOString() + ']';

        // component is optional
        if (component) {
            entry += '[' + component + ']';
        }

        // log may be an error or a string
        entry += ' ' + (log || '').toString();

        // if an error it is, a stack trace it has. print it, we should.
        if (log.stack) {
            entry += ' . Stack: ' + log.stack;
        }

        entry += '\n';
        return entry;
    }

    /**
     * Collect application logs for bug report
     */
    function collectApplicationLogs() {
        let dump = '';
        const appender = {
            log: function(level, date, component, log) {
                dump += formatLogEntry(level, date, component, log);
            }
        };
        axe.dump(appender);
        return dump;
    }

    /**
     * Populate composer with bug report details
     */
    function reportBug() {
        const dump = collectApplicationLogs();

        $scope.to = [{
            address: str.supportAddress
        }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody
            .replace('{0}', navigator.userAgent)
            .replace('{1}', cfg.appVersion) + dump;
    }

    /**
     * Extract reply-to address from email
     */
    function extractReplyToAddress(originalEmail) {
        return originalEmail.replyTo && originalEmail.replyTo[0] && originalEmail.replyTo[0].address || originalEmail.from[0].address;
    }

    /**
     * Set up recipient field and message references for reply
     */
    function setupReplyRecipients(originalEmail, replyTo) {
        $scope.to.unshift({
            address: replyTo
        });
        $scope.to.forEach($scope.verify);

        $scope.references = (originalEmail.references || []);
        if (originalEmail.id && $scope.references.indexOf(originalEmail.id) < 0) {
            $scope.references = $scope.references.concat(originalEmail.id);
        }
        if (originalEmail.id) {
            $scope.inReplyTo = originalEmail.id;
        }
    }

    /**
     * Add recipients from original email to CC field for reply-all
     */
    function setupReplyAllRecipients(originalEmail, replyTo) {
        originalEmail.to.concat(originalEmail.cc).forEach(function(recipient) {
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

    /**
     * Set up attachments and references for forwarded message
     */
    function setupForwardAttachments(originalEmail) {
        // create a new array, otherwise removing an attachment will also
        // remove it from the original in the mail list as a side effect
        $scope.attachments = [].concat(originalEmail.attachments);
        if (originalEmail.id) {
            $scope.references = [originalEmail.id];
        }
    }

    /**
     * Format recipient list as comma-separated string with names and addresses
     */
    function formatRecipientList(recipients) {
        let result = '';
        recipients.forEach(function(recipient) {
            result += (result) ? ', ' : '';
            result += ((recipient.name) ? recipient.name : recipient.address) + ' <' + recipient.address + '>';
        });
        return result;
    }

    /**
     * Generate quoted text for reply or forward
     */
    function generateQuotedText(originalEmail, replyTo, isForward) {
        const from = originalEmail.from[0].name || replyTo;
        const sentDate = $filter('date')(originalEmail.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        let body = '';

        if (isForward) {
            body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + originalEmail.from[0].name + ' <' + originalEmail.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + originalEmail.subject + '\n' +
                'To: ' + formatRecipientList(originalEmail.to) + '\n' +
                ((originalEmail.cc && originalEmail.cc.length > 0) ? 'Cc: ' + formatRecipientList(originalEmail.cc) + '\n' : '') +
                '\n\n';
        } else {
            body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (originalEmail.body) {
            body += originalEmail.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }

        return body;
    }

    /**
     * Populate composer fields based on reply/forward action
     */
    function fillFields(originalEmail, replyAll, isForward) {
        if (!originalEmail) {
            return;
        }

        $scope.writerTitle = (isForward) ? 'Forward' : 'Reply';

        const replyTo = extractReplyToAddress(originalEmail);

        // fill recipient field and references
        if (!isForward) {
            setupReplyRecipients(originalEmail, replyTo);
        }

        if (replyAll) {
            setupReplyAllRecipients(originalEmail, replyTo);
        }

        // fill attachments and references on forward
        if (isForward) {
            setupForwardAttachments(originalEmail);
        }

        // fill subject
        if (isForward) {
            $scope.subject = 'Fwd: ' + originalEmail.subject;
        } else {
            $scope.subject = originalEmail.subject ? 'Re: ' + originalEmail.subject.replace('Re: ', '') : '';
        }

        // fill text body
        $scope.body = generateQuotedText(originalEmail, replyTo, isForward);
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
     * Normalize recipient display and address fields
     */
    function normalizeRecipientFields(recipient) {
        if (recipient.address) {
            // display only email address after autocomplete
            recipient.displayId = recipient.address;
        } else {
            // set address after manual input
            recipient.address = recipient.displayId;
        }
    }

    /**
     * Validate email address format
     */
    function isValidEmailAddress(address) {
        return util.validateEmailAddress(address);
    }

    /**
     * Fetch and set public key for recipient
     */
    function fetchRecipientKey(recipient) {
        return keychain.refreshKeyForUserId({
            userId: recipient.address
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
        });
    }

    /**
     * Verify email address and fetch its public key
     */
    $scope.verify = function(recipient) {
        if (!recipient) {
            return;
        }

        normalizeRecipientFields(recipient);

        // set display to insecure while fetching keys
        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        // verify email address
        if (!isValidEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        // check if to address is contained in known public keys
        // when we write an email, we always need to work with the latest keys available
        return $q(function(resolve) {
            resolve();
        }).then(function() {
            return fetchRecipientKey(recipient);
        }).catch(dialog.error);
    };

    /**
     * Validate recipient address and count receivers
     */
    function validateAndCountRecipient(recipient) {
        // validate address
        if (!isValidEmailAddress(recipient.address)) {
            return dialog.info({
                title: 'Warning',
                message: 'Invalid recipient address!'
            });
        }
        return true;
    }

    /**
     * Check if all recipients have secure keys
     */
    function areAllRecipientsSecure() {
        let allSecure = true;
        const checkSecurity = function(recipient) {
            if (!recipient.secure) {
                allSecure = false;
            }
        };

        $scope.to.forEach(checkSecurity);
        $scope.cc.forEach(checkSecurity);
        $scope.bcc.forEach(checkSecurity);

        return allSecure;
    }

    /**
     * Count total number of recipients
     */
    function countRecipients() {
        let count = 0;
        const increment = function(recipient) {
            if (isValidEmailAddress(recipient.address)) {
                count++;
            }
        };

        $scope.to.forEach(increment);
        $scope.cc.forEach(increment);
        $scope.bcc.forEach(increment);

        return count;
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        // validate all recipients
        $scope.to.forEach(validateAndCountRecipient);
        $scope.cc.forEach(validateAndCountRecipient);
        $scope.bcc.forEach(validateAndCountRecipient);

        const numReceivers = countRecipients();

        // only allow sending if receivers exist
        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

        let allSecure = areAllRecipientsSecure();

        // bcc automatically disables secure sending
        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            allSecure = false;
        }

        if (allSecure) {
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

    //
    // Editing attachments
    //

    $scope.remove = function(attachment) {
        $scope.attachments.splice($scope.attachments.indexOf(attachment), 1);
    };

    /**
     * Collect recipients without public keys
     */
    function collectUnencryptedRecipients() {
        const invitees = [];

        const checkRecipient = function(recipient) {
            if (isValidEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        };

        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        return invitees;
    }

    /**
     * Send invitation mail for a single recipient
     */
    function sendInvitationForRecipient(sender, recipientAddress) {
        const invitationMail = invitation.createMail({
            sender: sender,
            recipient: recipientAddress
        });

        return outbox.put(invitationMail).then(function() {
            return invitation.invite({
                recipient: recipientAddress,
                sender: sender
            });
        });
    }

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const sender = auth.emailAddress;
        const sendJobs = [];

        $scope.showInvite = false;

        const invitees = collectUnencryptedRecipients();

        return $q(function(resolve) {
            resolve();
        }).then(function() {
            invitees.forEach(function(recipientAddress) {
                const promise = sendInvitationForRecipient(sender, recipientAddress);
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

    //
    // Editing email body
    //

    /**
     * Build message headers for in-reply-to and references
     */
    function buildMessageHeaders() {
        const headers = {};

        if ($scope.inReplyTo) {
            headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }

        if ($scope.references && $scope.references.length) {
            headers.references = $scope.references.map(function(reference) {
                return '<' + reference + '>';
            }).join(' ');
        }

        return headers;
    }

    /**
     * Build email message object from composer fields
     */
    function buildMessage() {
        return {
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
            headers: buildMessageHeaders()
        };
    }

    /**
     * Mark original email as answered if replying
     */
    function markOriginalAsAnswered() {
        if (!$scope.replyTo || $scope.replyTo.answered) {
            return $q.when();
        }

        $scope.replyTo.answered = true;
        return email.setFlags({
            folder: currentFolder(),
            message: $scope.replyTo
        });
    }

    /**
     * Send composed message to outbox
     */
    $scope.sendToOutbox = function() {
        const message = buildMessage();

        // close the writer
        $scope.state.writer.close();
        // close read mode after reply
        if ($scope.replyTo) {
            status.setReading(false);
        }

        // persist the email to disk for later sending
        return $q(function(resolve) {
            resolve();
        }).then(function() {
            return outbox.put(message);
        }).then(function() {
            // if we need to synchronize replyTo.answered = true to imap,
            // let's do that. otherwise, we're done
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

    /**
     * Populate address book cache from local public keys
     */
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

    /**
     * Filter address book cache by query string
     */
    function filterAddressBook(query) {
        return $scope.addressBookCache.filter(function(entry) {
            return entry.displayId.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
    }

    /**
     * Look up addresses in address book
     */
    $scope.lookupAddressBook = function(query) {
        return $q(function(resolve) {
            resolve();
        }).then(function() {
            if ($scope.addressBookCache) {
                return;
            }
            // populate address book cache
            return populateAddressBookCache();
        }).then(function() {
            // filter the address book cache
            return filterAddressBook(query);
        }).catch(dialog.error);
    };

    //
    // Helpers
    //

    /**
     * Get current folder from navigation state
     */
    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    /**
     * Filter out objects without an address property, i.e. empty addresses
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;
```
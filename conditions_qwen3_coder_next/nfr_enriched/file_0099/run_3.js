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
        const dump = generateLogDump();
        $scope.to = [{
            address: str.supportAddress
        }];
        $scope.writerTitle = str.bugReportTitle;
        $scope.subject = str.bugReportSubject;
        $scope.body = str.bugReportBody.replace('{0}', navigator.userAgent).replace('{1}', cfg.appVersion) + dump;
    }

    /**
     * Generate log dump using axe logger
     * @returns {string} Formatted log dump string
     */
    function generateLogDump() {
        let dump = '';

        const appender = {
            log: function(level, date, component, log) {
                const levelTag = getLevelTag(level);
                dump += levelTag + '[' + date.toISOString() + ']';

                if (component) {
                    dump += '[' + component + ']';
                }

                dump += ' ' + ((log || '').toString() || '');

                if (log && log.stack) {
                    dump += ' . Stack: ' + log.stack;
                }

                dump += '\n';
            }
        };

        axe.dump(appender);
        return dump;
    }

    /**
     * Map log level to system tag
     * @param {number} level - Axe log level constant
     * @returns {string} Tag string like '[DEBUG]', '[INFO]', etc.
     */
    function getLevelTag(level) {
        if (level === axe.DEBUG) return '[DEBUG]';
        if (level === axe.INFO) return '[INFO]';
        if (level === axe.WARN) return '[WARN]';
        if (level === axe.ERROR) return '[ERROR]';
        return '';
    }

    /**
     * Populate message fields based on original message, reply/forward mode
     * @param {object|null} re - Original message to reply or forward
     * @param {boolean} replyAll - Flag to include CC recipients
     * @param {boolean} forward - Flag for forwarding mode
     */
    function fillFields(re, replyAll, forward) {
        if (!re) return;

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        const replyTo = getReplyToAddress(re);

        if (!forward) {
            initializeReplyFields(re, replyTo);
        }

        if (replyAll) {
            addReplyAllRecipients(re, replyTo);
        }

        if (forward) {
            initializeForwardFields(re);
        }

        setSubject(re, forward);
        setBody(re, replyTo, forward);
    }

    /**
     * Extract reply-to address from original message
     * @param {object} re - Original message
     * @returns {string} Reply-to address
     */
    function getReplyToAddress(re) {
        return (re.replyTo && re.replyTo[0] && re.replyTo[0].address) || re.from[0].address;
    }

    /**
     * Initialize fields for reply behavior
     * @param {object} re - Original message
     * @param {string} replyTo - Reply-to address
     */
    function initializeReplyFields(re, replyTo) {
        $scope.to.unshift({ address: replyTo });
        $scope.to.forEach($scope.verify);
        updateReferences(re);
        $scope.inReplyTo = re.id;
    }

    /**
     * Update references and in-reply-to for replies
     * @param {object} re - Original message
     */
    function updateReferences(re) {
        $scope.references = (re.references || []).concat(re.id || []);
        $scope.references = _.uniq($scope.references, address => address);
    }

    /**
     * Add CC recipients when replying to all
     * @param {object} re - Original message
     * @param {string} replyTo - Reply-to address
     */
    function addReplyAllRecipients(re, replyTo) {
        const me = auth.emailAddress;

        const recipients = re.to.concat(re.cc);
        recipients.forEach(recipient => {
            if (recipient.address !== me || recipient.address === replyTo) {
                $scope.cc.unshift({ address: recipient.address });
            }
        });

        // Filter duplicates
        $scope.cc = _.uniq($scope.cc, r => r.address);
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /**
     * Initialize fields for forwarding
     * @param {object} re - Original message
     */
    function initializeForwardFields(re) {
        $scope.attachments = re.attachments.slice();
        if (re.id) {
            $scope.references = [re.id];
        }
    }

    /**
     * Set subject line appropriately for reply or forward
     * @param {object} re - Original message
     * @param {boolean} forward - Forwarding flag
     */
    function setSubject(re, forward) {
        if (forward) {
            $scope.subject = 'Fwd: ' + re.subject;
        } else {
            $scope.subject = re.subject ? 'Re: ' + re.subject.replace('Re: ', '') : '';
        }
    }

    /**
     * Construct email body for reply or forward
     * @param {object} re - Original message
     * @param {string} replyTo - Reply-to address
     * @param {boolean} forward - Forwarding flag
     */
    function setBody(re, replyTo, forward) {
        const from = re.from[0].name || replyTo;
        const sentDate = $filter('date')(re.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const createString = arr => arr.map(to =>
            (to.name ? `${to.name} <${to.address}>` : to.address)).join(', ');

        if (forward) {
            $scope.body = '\n\n' +
                '---------- Forwarded message ----------\n' +
                'From: ' + re.from[0].name + ' <' + re.from[0].address + '>\n' +
                'Date: ' + sentDate + '\n' +
                'Subject: ' + re.subject + '\n' +
                'To: ' + createString(re.to) + '\n' +
                (re.cc && re.cc.length > 0 ? 'Cc: ' + createString(re.cc) + '\n' : '') +
                '\n\n';
        } else {
            $scope.body = '\n\n' + sentDate + ' ' + from + ' wrote:\n> ';
        }

        if (re.body) {
            $scope.body += re.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
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

        setRecipientDisplay(recipient);
        recipient.key = undefined;
        recipient.secure = false;
        $scope.checkSendStatus();

        if (!util.validateEmailAddress(recipient.address)) {
            recipient.secure = undefined;
            $scope.checkSendStatus();
            return;
        }

        fetchAndVerifyKey(recipient);
    };

    /**
     * Set {address, displayId} on recipient based on input format
     * @param {object} recipient - Recipient object to update
     */
    function setRecipientDisplay(recipient) {
        if (recipient.address) {
            recipient.displayId = recipient.address;
        } else {
            recipient.address = recipient.displayId;
        }
    }

    /**
     * Fetch and verify public key for recipient
     * @param {object} recipient - Recipient object populated with known data
     */
    function fetchAndVerifyKey(recipient) {
        $q.resolve()
            .then(() => keychain.refreshKeyForUserId({ userId: recipient.address }))
            .then(key => {
                if (!key) {
                    $scope.showInvite = true;
                    $scope.checkSendStatus();
                    return;
                }

                const userIds = pgp.getKeyParams(key.publicKey).userIds;
                const matchingUserId = _.findWhere(userIds, { emailAddress: recipient.address });

                if (matchingUserId) {
                    recipient.key = key;
                    recipient.secure = true;
                } else {
                    $scope.showInvite = true;
                }
                $scope.checkSendStatus();
            })
            .catch(dialog.error);
    }

    /**
     * Check if it is ok to send an email depending on the invitation state of the addresses
     */
    $scope.checkSendStatus = function() {
        $scope.okToSend = false;
        $scope.sendBtnText = undefined;
        $scope.sendBtnSecure = undefined;

        const result = computeSendStatus();
        configureSendControls(result);
    };

    /**
     * Compute send status flags based on all recipients
     * @returns {object} Result object with all required status values
     */
    function computeSendStatus() {
        const result = {
            allSecure: true,
            numReceivers: 0
        };

        [$scope.to, $scope.cc, $scope.bcc].forEach(recipients => {
            recipients.forEach(recipient => {
                if (!util.validateEmailAddress(recipient.address)) {
                    return;
                }
                result.numReceivers++;
                if (!recipient.secure) {
                    result.allSecure = false;
                }
            });
        });

        if (result.numReceivers < 1) {
            result.showInvite = false;
            return result;
        }

        if ($scope.bcc.filter(filterEmptyAddresses).length > 0) {
            result.allSecure = false;
        }

        result.showInvite = result.allSecure;
        return result;
    }

    /**
     * Configure send button state based on status computation result
     * @param {object} result - Result object from computeSendStatus()
     */
    function configureSendControls(result) {
        if (!result.numReceivers) {
            $scope.showInvite = false;
            return;
        }

        if (result.allSecure) {
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
        $scope.showInvite = false;

        const invitees = collectInvitees();

        return sendInvitations(invitees)
            .catch(() => {
                $scope.showInvite = true;
                return dialog.error(new Error('Failed to send invitation emails'));
            });
    };

    /**
     * Collect list of recipients missing valid keys and not previously invited
     * @returns {string[]} List of email addresses needing invitation
     */
    function collectInvitees() {
        const invitees = [];
        const invited = $scope.invited;

        [$scope.to, $scope.cc, $scope.bcc].forEach(recipients => {
            recipients.forEach(recipient => {
                if (util.validateEmailAddress(recipient.address) &&
                    !recipient.secure &&
                    invited.indexOf(recipient.address) === -1) {
                    invitees.push(recipient.address);
                }
            });
        });

        return invitees;
    }

    /**
     * Send invitation emails to specified invitees
     * @param {string[]} invitees - Email addresses to invite
     * @returns {Promise} Promise resolving after all invitations are sent
     */
    function sendInvitations(invitees) {
        const sender = auth.emailAddress;
        const sendJobs = [];

        return $q.resolve().then(() => {
            invitees.forEach(recipientAddress => {
                const invitationMail = invitation.createMail({
                    sender: sender,
                    recipient: recipientAddress
                });

                const promise = outbox.put(invitationMail).then(() => {
                    return invitation.invite({
                        recipient: recipientAddress,
                        sender: sender
                    });
                });

                sendJobs.push(promise);
                $scope.invited.push(recipientAddress);
            });

            return Promise.all(sendJobs);
        });
    }

    //
    // Editing email body
    //

    $scope.sendToOutbox = function() {
        const message = constructMessageModel();

        closeWriter();

        return saveMessageToOutbox(message)
            .then(() => {
                if (!$scope.replyTo || $scope.replyTo.answered) {
                    return;
                }

                $scope.replyTo.answered = true;
                return email.setFlags({
                    folder: currentFolder(),
                    message: $scope.replyTo
                });
            })
            .catch(function(err) {
                if (err.code !== 42) {
                    dialog.error(err);
                }
            });
    };

    /**
     * Construct message object model for SMTP delivery
     * @returns {object} Email model ready for storage
     */
    function constructMessageModel() {
        const headers = {};

        if ($scope.inReplyTo) {
            headers['in-reply-to'] = '<' + $scope.inReplyTo + '>';
        }

        if ($scope.references && $scope.references.length) {
            headers.references = $scope.references.map(ref => '<' + ref + '>').join(' ');
        }

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
            headers
        };
    }

    /**
     * Trigger UI actions to close writer and related views
     */
    function closeWriter() {
        $scope.state.writer.close();
        if ($scope.replyTo) {
            status.setReading(false);
        }
    }

    /**
     * Save constructed message to outbox
     * @param {object} message - Email model
     * @returns {Promise} Outbox save operation promise
     */
    function saveMessageToOutbox(message) {
        return $q.resolve().then(() => outbox.put(message));
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
        return $q.resolve()
            .then(populateAddressBookCacheIfEmpty)
            .then(() => filterAddressBookCache(query));
    };

    /**
     * Populate address book cache if not yet populated
     * @returns {Promise} Resolves after cache population completes
     */
    function populateAddressBookCacheIfEmpty() {
        if ($scope.addressBookCache) return;

        return keychain.listLocalPublicKeys().then(keys => {
            $scope.addressBookCache = keys.map(key => {
                const name = pgp.getKeyParams(key.publicKey).userIds[0].name;
                return {
                    address: key.userId,
                    displayId: name + ' - ' + key.userId
                };
            });
        });
    }

    /**
     * Filter address book entries by search query
     * @param {string} query - Search term
     * @returns {object[]} Filtered display entries
     */
    function filterAddressBookCache(query) {
        return $scope.addressBookCache.filter(item =>
            item.displayId.toLowerCase().includes(query.toLowerCase())
        );
    }

    //
    // Helpers
    //

    function currentFolder() {
        return $scope.state.nav.currentFolder;
    }

    /**
     * Filter out empty address objects lacking an address property
     * @param {object} addr - Address object to test
     * @returns {boolean} True if address object is valid
     */
    function filterEmptyAddresses(addr) {
        return !!addr.address;
    }
};

module.exports = WriteCtrl;
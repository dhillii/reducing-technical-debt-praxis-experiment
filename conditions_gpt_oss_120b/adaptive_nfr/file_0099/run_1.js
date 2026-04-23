'use strict';

var util = require('crypto-lib').util;

//
// Controller
//

var WriteCtrl = function($scope, $window, $filter, $q, appConfig, auth, keychain, pgp, email, outbox, dialog, axe, status, invitation) {

    const str = appConfig.string;
    const cfg = appConfig.config;

    // set default value so that the popover height is correct on init
    $scope.keyId = 'XXXXXXXX';

    //
    // Init
    //

    $scope.state.writer = {
        /**
         * @param {Object} replyTo - Message being replied to (optional)
         * @param {boolean} replyAll
         * @param {boolean} forward
         */
        write: function(replyTo, replyAll, forward) {
            $scope.state.lightbox = 'write';
            $scope.replyTo = replyTo;

            resetFields();

            // fill fields depending on replyTo
            writeEmail({
                replyTo: replyTo,
                replyAll: !!replyAll,
                forward: !!forward
            });

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

    /**
     * @typedef {Object} WriteParams
     * @property {Object} replyTo
     * @property {boolean} replyAll
     * @property {boolean} forward
     */

    /**
     * Handles writing email based on parameters.
     * @param {WriteParams} params
     */
    function writeEmail(params) {
        const { replyTo, replyAll, forward } = params;
        $scope.state.lightbox = 'write';
        $scope.replyTo = replyTo;

        resetFields();

        fillFields({
            message: replyTo,
            replyAll: replyAll,
            forward: forward
        });

        $scope.verify($scope.to[0]);
    }

    /**
     * @typedef {Object} FillParams
     * @property {Object} message
     * @property {boolean} replyAll
     * @property {boolean} forward
     */

    /**
     * Fills fields based on the provided parameters.
     * @param {FillParams} params
     */
    function fillFields(params) {
        const { message, replyAll, forward } = params;
        if (!message) {
            return;
        }

        $scope.writerTitle = forward ? 'Forward' : 'Reply';

        const replyToAddress = (message.replyTo && message.replyTo[0] && message.replyTo[0].address) || (message.from && message.from[0] && message.from[0].address);

        if (!forward) {
            addRecipient($scope.to, replyToAddress);
            $scope.to.forEach($scope.verify);

            $scope.references = (message.references || []).slice();
            if (message.id && $scope.references.indexOf(message.id) < 0) {
                $scope.references = $scope.references.concat(message.id);
            }
            if (message.id) {
                $scope.inReplyTo = message.id;
            }
        }

        if (replyAll) {
            handleReplyAll(message, replyToAddress);
        }

        if (forward) {
            handleForward(message);
        } else {
            handleReply(message);
        }

        const subjectPrefix = forward ? 'Fwd: ' : 'Re: ';
        $scope.subject = forward ? subjectPrefix + message.subject : (message.subject ? subjectPrefix + message.subject.replace('Re: ', '') : '');
    }

    /**
     * Adds a recipient to a list if not already present.
     * @param {Array} list
     * @param {string} address
     */
    function addRecipient(list, address) {
        list.unshift({ address: address });
    }

    /**
     * Handles reply-all logic.
     * @param {Object} message
     * @param {string} originalReplyTo
     */
    function handleReplyAll(message, originalReplyTo) {
        const combined = (message.to || []).concat(message.cc || []);
        combined.forEach(function(recipient) {
            const me = auth.emailAddress;
            if (recipient.address === me && originalReplyTo !== me) {
                return;
            }
            addRecipient($scope.cc, recipient.address);
        });

        // filter duplicates
        $scope.cc = _.uniq($scope.cc, function(recipient) {
            return recipient.address;
        });
        $scope.showCC = true;
        $scope.cc.forEach($scope.verify);
    }

    /**
     * Handles forward-specific logic.
     * @param {Object} message
     */
    function handleForward(message) {
        // create a new array, otherwise removing an attachment will also
        // remove it from the original in the mail list as a side effect
        $scope.attachments = (message.attachments || []).slice();
        if (message.id) {
            $scope.references = [message.id];
        }

        const fromName = message.from && message.from[0] && message.from[0].name;
        const fromAddress = message.from && message.from[0] && message.from[0].address;
        const sentDate = $filter('date')(message.sentDate, 'EEEE, MMM d, yyyy h:mm a');

        const bodyHeader = [
            '---------- Forwarded message ----------',
            `From: ${fromName} <${fromAddress}>`,
            `Date: ${sentDate}`,
            `Subject: ${message.subject}`,
            `To: ${createAddressString(message.to)}`
        ];

        if (message.cc && message.cc.length > 0) {
            bodyHeader.push(`Cc: ${createAddressString(message.cc)}`);
        }

        $scope.body = '\n\n' + bodyHeader.join('\n') + '\n\n';
    }

    /**
     * Handles reply-specific logic.
     * @param {Object} message
     */
    function handleReply(message) {
        const fromName = message.from && message.from[0] && message.from[0].name;
        const fromAddress = message.from && message.from[0] && message.from[0].address;
        const sentDate = $filter('date')(message.sentDate, 'EEEE, MMM d, yyyy h:mm a');
        const fromDisplay = message.from[0].name || fromAddress;

        const header = `\n\n${sentDate} ${fromDisplay} wrote:\n> `;
        let body = header;

        if (message.body) {
            body += message.body.trim().split('\n').join('\n> ').replace(/ >/g, '>');
        }

        $scope.body = body;
    }

    /**
     * Creates a comma‑separated address string.
     * @param {Array} array
     * @returns {string}
     */
    function createAddressString(array) {
        return (array || []).map(function(to) {
            const namePart = to.name ? to.name : to.address;
            return `${namePart} <${to.address}>`;
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
                const userIds = pgp.getKeyParams(key.publicKey).userIds;
                const matchingUserId = _.findWhere(userIds, {
                    emailAddress: recipient.address
                });
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

        let allSecure = true;
        let numReceivers = 0;

        // count number of receivers and check security
        $scope.to.forEach(checkRecipient);
        $scope.cc.forEach(checkRecipient);
        $scope.bcc.forEach(checkRecipient);

        function checkRecipient(recipient) {
            // validate address
            if (!util.validateEmailAddress(recipient.address)) {
                dialog.info({
                    title: 'Warning',
                    message: 'Invalid recipient address!'
                });
                return;
            }
            numReceivers++;
            if (!recipient.secure) {
                allSecure = false;
            }
        }

        // only allow sending if receivers exist
        if (numReceivers < 1) {
            $scope.showInvite = false;
            return;
        }

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
        const idx = $scope.attachments.indexOf(attachment);
        if (idx >= 0) {
            $scope.attachments.splice(idx, 1);
        }
    };

    /**
     * Invite all users without a public key
     */
    $scope.invite = function() {
        const sender = auth.emailAddress;
        const sendJobs = [];
        const invitees = [];

        $scope.showInvite = false;

        // get recipients with no keys
        $scope.to.forEach(collectInvitees);
        $scope.cc.forEach(collectInvitees);
        $scope.bcc.forEach(collectInvitees);

        function collectInvitees(recipient) {
            if (util.validateEmailAddress(recipient.address) && !recipient.secure && $scope.invited.indexOf(recipient.address) === -1) {
                invitees.push(recipient.address);
            }
        }

        return $q(function(resolve) {
            resolve();
        }).then(function() {
            invitees.forEach(function(recipientAddress) {
                const invitationMail = invitation.createMail({
                    sender: sender,
                    recipient: recipientAddress
                });
                const promise = outbox.put(invitationMail).then(function() {
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

    $scope.sendToOutbox = function() {
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
            if (!$scope.replyTo || $scope.replyTo.answered) {
                return;
            }
            $scope.replyTo.answered = true;
            return email.setFlags({
                folder: currentFolder(),
                message: $scope.replyTo
            });
        }).catch(function(err) {
            if (err && err.code !== 42) {
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
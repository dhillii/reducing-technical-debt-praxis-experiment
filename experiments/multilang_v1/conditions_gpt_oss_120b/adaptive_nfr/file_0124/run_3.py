class PassportNexus(HTTPClient):
    """
    Used to obtain the URL of a valid passport
    login HTTPS server.

    This class is used internally and should
    not be instantiated directly -- that is,
    The passport logging in process is handled
    transparently by NotificationClient.
    """

    def __init__(self, deferred, host):
        self.deferred = deferred
        self.host, self.path = _parsePrimitiveHost(host)

    def connectionMade(self):
        HTTPClient.connectionMade(self)
        self.sendCommand('GET', self.path)
        self.sendHeader('Host', self.host)
        self.endHeaders()
        self.headers = {}

    def handleHeader(self, header, value):
        h = header.lower()
        self.headers[h] = _parseHeader(h, value)

    def handleEndHeaders(self):
        if self.connected:
            self.transport.loseConnection()
        if 'passporturls' not in self.headers or 'dalogin' not in self.headers['passporturls']:
            self.deferred.errback(failure.Failure(failure.DefaultException("Invalid Nexus Reply")))
        self.deferred.callback('https://' + self.headers['passporturls']['dalogin'])

    def handleResponse(self, r):
        # No response body processing needed for Nexus requests; method intentionally left empty.
        pass

class PassportLogin(HTTPClient):
    """
    This class is used internally to obtain
    a login ticket from a passport HTTPS
    server -- it should not be used directly.
    """

    _finished = 0

    def __init__(self, deferred, userHandle, passwd, host, authData):
        self.deferred = deferred
        self.userHandle = userHandle
        self.passwd = passwd
        self.authData = authData
        self.host, self.path = _parsePrimitiveHost(host)

    def connectionMade(self):
        self.sendCommand('GET', self.path)
        self.sendHeader('Authorization', 'Passport1.4 OrgVerb=GET,OrgURL=http://messenger.msn.com,' +
                                         'sign-in=%s,pwd=%s,%s' % (quote(self.userHandle), self.passwd,self.authData))
        self.sendHeader('Host', self.host)
        self.endHeaders()
        self.headers = {}

    def handleHeader(self, header, value):
        h = header.lower()
        self.headers[h] = _parseHeader(h, value)

    def handleEndHeaders(self):
        if self._finished:
            return
        self._finished = 1 # I think we need this because of HTTPClient
        if self.connected:
            self.transport.loseConnection()
        authHeader = 'authentication-info'
        _interHeader = 'www-authenticate'
        if _interHeader in self.headers:
            authHeader = _interHeader
        try:
            info = self.headers[authHeader]
            status = info['da-status']
            handler = getattr(self, 'login_%s' % (status,), None)
            if handler:
                handler(info)
            else:
                raise Exception()
        except Exception, e:
            self.deferred.errback(failure.Failure(e))

    def handleResponse(self, r):
        # No response body processing needed for login requests; method intentionally left empty.
        pass

    def login_success(self, info):
        ticket = info['from-pp']
        ticket = ticket[1:len(ticket)-1]
        self.deferred.callback((LOGIN_SUCCESS, ticket))

    def login_failed(self, info):
        self.deferred.callback((LOGIN_FAILURE, unquote(info['cbtxt'])))

    def login_redir(self, info):
        self.deferred.callback((LOGIN_REDIRECT, self.headers['location'], self.authData))


class DispatchClient(MSNEventBase):
    """
    This class provides support for clients connecting to the dispatch server
    @ivar userHandle: your user handle (passport) needed before connecting.
    """

    # eventually this may become an attribute of the
    # factory.
    userHandle = ""

    def connectionMade(self):
        MSNEventBase.connectionMade(self)
        self.sendLine('VER %s %s' % (self._nextTransactionID(), MSN_PROTOCOL_VERSION))

    ### protocol command handlers ( there is no need to override these )

    def handle_VER(self, params):
        id = self._nextTransactionID()
        self.sendLine("CVR %s %s %s" % (id, MSN_CVR_STR, self.userHandle))

    def handle_CVR(self, params):
        self.sendLine("USR %s TWN I %s" % (self._nextTransactionID(), self.userHandle))

    def handle_XFR(self, params):
        if len(params) < 4:
            raise MSNProtocolError, "Invalid number of parameters for XFR"
        id, refType, addr = params[:3]
        # was addr a host:port pair?
        try:
            host, port = addr.split(':')
        except ValueError:
            host = addr
            port = MSN_PORT
        if refType == "NS":
            self.gotNotificationReferral(host, int(port))

    ### callbacks

    def gotNotificationReferral(self, host, port):
        """
        Called when a referral to the notification server is received.
        Subclasses should override this method to handle the referral.
        """
        # Default implementation does nothing; method intentionally left empty.
        pass


class NotificationClient(MSNEventBase):
    """
    This class provides support for clients connecting
    to the notification server.
    """

    factory = None # sssh pychecker

    def __init__(self, currentID=0):
        MSNEventBase.__init__(self)
        self.currentID = currentID
        self._state = ['DISCONNECTED', {}]

    def _setState(self, state):
        self._state[0] = state

    def _getState(self):
        return self._state[0]

    def _getStateData(self, key):
        return self._state[1][key]

    def _setStateData(self, key, value):
        self._state[1][key] = value

    def _remStateData(self, *args):
        for key in args:
            del self._state[1][key]

    def connectionMade(self):
        MSNEventBase.connectionMade(self)
        self._setState('CONNECTED')
        self.sendLine("VER %s %s" % (self._nextTransactionID(), MSN_PROTOCOL_VERSION))

    def connectionLost(self, reason):
        self._setState('DISCONNECTED')
        self._state[1] = {}
        MSNEventBase.connectionLost(self, reason)

    def checkMessage(self, message):
        """ hook used for detecting specific notification messages """
        cTypes = [s.lstrip() for s in message.getHeader('Content-Type').split(';')]
        if 'text/x-msmsgsprofile' in cTypes:
            self.gotProfile(message)
            return 0
        return 1

    ### protocol command handlers - no need to override these

    def handle_VER(self, params):
        id = self._nextTransactionID()
        self.sendLine("CVR %s %s %s" % (id, MSN_CVR_STR, self.factory.userHandle))

    def handle_CVR(self, params):
        self.sendLine("USR %s TWN I %s" % (self._nextTransactionID(), self.factory.userHandle))

    def handle_USR(self, params):
        if len(params) != 4 and len(params) != 6:
            raise MSNProtocolError, "Invalid Number of Parameters for USR"

        mechanism = params[1]
        if mechanism == "OK":
            self.loggedIn(params[2], unquote(params[3]), int(params[4]))
        elif params[2].upper() == "S":
            # we need to obtain auth from a passport server
            f = self.factory
            d = execute(
                _login, f.userHandle, f.password, f.passportServer,
                authData=params[3])
            d.addCallback(self._passportLogin)
            d.addErrback(self._passportError)

    def _passportLogin(self, result):
        if result[0] == LOGIN_REDIRECT:
            d = _login(self.factory.userHandle, self.factory.password,
                       result[1], cached=1, authData=result[2])
            d.addCallback(self._passportLogin)
            d.addErrback(self._passportError)
        elif result[0] == LOGIN_SUCCESS:
            self.sendLine("USR %s TWN S %s" % (self._nextTransactionID(), result[1]))
        elif result[0] == LOGIN_FAILURE:
            self.loginFailure(result[1])


    def _passportError(self, failure):
        """
        Handle a problem logging in via the Passport server, passing on the
        error as a string message to the C{loginFailure} callback.
        """
        if failure.check(SSLRequired):
            failure = failure.getErrorMessage()
        self.loginFailure("Exception while authenticating: %s" % failure)


    def handle_CHG(self, params):
        checkParamLen(len(params), 3, 'CHG')
        id = int(params[0])
        if not self._fireCallback(id, params[1]):
            self.statusChanged(params[1])

    def handle_ILN(self, params):
        checkParamLen(len(params), 5, 'ILN')
        self.gotContactStatus(params[1], params[2], unquote(params[3]))

    def handle_CHL(self, params):
        checkParamLen(len(params), 2, 'CHL')
        self.sendLine("QRY %s msmsgs@msnmsgr.com 32" % self._nextTransactionID())
        self.transport.write(md5(params[1] + MSN_CHALLENGE_STR).hexdigest())

    def handle_QRY(self, params):
        # No specific handling required for QRY responses; method intentionally left empty.
        pass

    def handle_NLN(self, params):
        checkParamLen(len(params), 4, 'NLN')
        self.contactStatusChanged(params[0], params[1], unquote(params[2]))

    def handle_FLN(self, params):
        checkParamLen(len(params), 1, 'FLN')
        self.contactOffline(params[0])

    def handle_LST(self, params):
        # support no longer exists for manually
        # requesting lists - why do I feel cleaner now?
        if self._getState() != 'SYNC':
            return
        contact = MSNContact(userHandle=params[0], screenName=unquote(params[1]),
                             lists=int(params[2]))
        if contact.lists & FORWARD_LIST:
            contact.groups.extend(map(int, params[3].split(',')))
        self._getStateData('list').addContact(contact)
        self._setStateData('last_contact', contact)
        sofar = self._getStateData('lst_sofar') + 1
        if sofar == self._getStateData('lst_reply'):
            # this is the best place to determine that
            # a syn really has finished - msn _may_ send
            # BPR information for the last contact
            # which is unfortunate because it means
            # the real end of a syn is non-deterministic.
            # to handle this we'll keep 'last_contact' hanging
            # around in the state data and update it if we need
            # later.
            self._setState('SESSION')
            contacts = self._getStateData('list')
            phone = self._getStateData('phone')
            id = self._getStateData('synid')
            self._remStateData('lst_reply', 'lsg_reply', 'lst_sofar', 'phone', 'synid', 'list')
            self._fireCallback(id, contacts, phone)
        else:
            self._setStateData('lst_sofar',sofar)

    def handle_BLP(self, params):
        # check to see if this is in response to a SYN
        if self._getState() == 'SYNC':
            self._getStateData('list').privacy = listCodeToID[params[0].lower()]
        else:
            id = int(params[0])
            self._fireCallback(id, int(params[1]), listCodeToID[params[2].lower()])

    def handle_GTC(self, params):
        # check to see if this is in response to a SYN
        if self._getState() == 'SYNC':
            if params[0].lower() == "a":
                self._getStateData('list').autoAdd = 0
            elif params[0].lower() == "n":
                self._getStateData('list').autoAdd = 1
            else:
                raise MSNProtocolError, "Invalid Parameter for GTC" # debug
        else:
            id = int(params[0])
            if params[1].lower() == "a":
                self._fireCallback(id, 0)
            elif params[1].lower() == "n":
                self._fireCallback(id, 1)
            else:
                raise MSNProtocolError, "Invalid Parameter for GTC" # debug

    def handle_SYN(self, params):
        id = int(params[0])
        if len(params) == 2:
            self._setState('SESSION')
            self._fireCallback(id, None, None)
        else:
            contacts = MSNContactList()
            contacts.version = int(params[1])
            self._setStateData('list', contacts)
            self._setStateData('lst_reply', int(params[2]))
            self._setStateData('lsg_reply', int(params[3]))
            self._setStateData('lst_sofar', 0)
            self._setStateData('phone', [])

    def handle_LSG(self, params):
        if self._getState() == 'SYNC':
            self._getStateData('list').groups[int(params[0])] = unquote(params[1])

        # Please see the comment above the requestListGroups / requestList methods
        # regarding support for this
        #
        #else:
        #    self._getStateData('groups').append((int(params[4]), unquote(params[5])))
        #    if params[3] == params[4]: # this was the last group
        #        self._fireCallback(int(params[0]), self._getStateData('groups'), int(params[1]))
        #        self._remStateData('groups')

    def handle_PRP(self, params):
        if self._getState() == 'SYNC':
            self._getStateData('phone').append((params[0], unquote(params[1])))
        else:
            self._fireCallback(int(params[0]), int(params[1]), unquote(params[3]))

    def handle_BPR(self, params):
        numParams = len(params)
        if numParams == 2: # part of a syn
            self._getStateData('last_contact').setPhone(params[0], unquote(params[1]))
        elif numParams == 4:
            self.gotPhoneNumber(int(params[0]), params[1], params[2], unquote(params[3]))

    def handle_ADG(self, params):
        checkParamLen(len(params), 5, 'ADG')
        id = int(params[0])
        if not self._fireCallback(id, int(params[1]), unquote(params[2]), int(params[3])):
            raise MSNProtocolError, "ADG response does not match up to a request" # debug

    def handle_RMG(self, params):
        checkParamLen(len(params), 3, 'RMG')
        id = int(params[0])
        if not self._fireCallback(id, int(params[1]), int(params[2])):
            raise MSNProtocolError, "RMG response does not match up to a request" # debug

    def handle_REG(self, params):
        checkParamLen(len(params), 5, 'REG')
        id = int(params[0])
        if not self._fireCallback(id, int(params[1]), int(params[2]), unquote(params[3])):
            raise MSNProtocolError, "REG response does not match up to a request" # debug

    def handle_ADD(self, params):
        numParams = len(params)
        if numParams < 5 or params[1].upper() not in ('AL','BL','RL','FL'):
            raise MSNProtocolError, "Invalid Parameters for ADD" # debug
        id = int(params[0])
        listType = params[1].lower()
        listVer = int(params[2])
        userHandle = params[3]
        groupID = None
        if numParams == 6: # they sent a group id
            if params[1].upper() != "FL":
                raise MSNProtocolError, "Only forward list can contain groups" # debug
            groupID = int(params[5])
        if not self._fireCallback(id, listCodeToID[listType], userHandle, listVer, groupID):
            self.userAddedMe(userHandle, unquote(params[4]), listVer)

    def handle_REM(self, params):
        numParams = len(params)
        if numParams < 4 or params[1].upper() not in ('AL','BL','FL','RL'):
            raise MSNProtocolError, "Invalid Parameters for REM" # debug
        id = int(params[0])
        listType = params[1].lower()
        listVer = int(params[2])
        userHandle = params[3]
        groupID = None
        if numParams == 5:
            if params[1] != "FL":
                raise MSNProtocolError, "Only forward list can contain groups" # debug
            groupID = int(params[4])
        if not self._fireCallback(id, listCodeToID[listType], userHandle, listVer, groupID):
            if listType.upper() == "RL":
                self.userRemovedMe(userHandle, listVer)

    def handle_REA(self, params):
        checkParamLen(len(params), 4, 'REA')
        id = int(params[0])
        self._fireCallback(id, int(params[1]), unquote(params[3]))

    def handle_XFR(self, params):
        checkParamLen(len(params), 5, 'XFR')
        id = int(params[0])
        # check to see if they sent a host/port pair
        try:
            host, port = params[2].split(':')
        except ValueError:
            host = params[2]
            port = MSN_PORT

        if not self._fireCallback(id, host, int(port), params[4]):
            raise MSNProtocolError, "Got XFR (referral) that I didn't ask for .. should this happen?" # debug

    def handle_RNG(self, params):
        checkParamLen(len(params), 6, 'RNG')
        # check for host:port pair
        try:
            host, port = params[1].split(":")
            port = int(port)
        except ValueError:
            host = params[1]
            port = MSN_PORT
        self.gotSwitchboardInvitation(int(params[0]), host, port, params[3], params[4],
                                      unquote(params[5]))

    def handle_OUT(self, params):
        checkParamLen(len(params), 1, 'OUT')
        if params[0] == "OTH":
            self.multipleLogin()
        elif params[0] == "SSD":
            self.serverGoingDown()
        else:
            raise MSNProtocolError, "Invalid Parameters received for OUT" # debug

    # callbacks

    def loggedIn(self, userHandle, screenName, verified):
        """
        Called when the client has logged in.
        The default behaviour of this method is to
        update the factory with our screenName and
        to sync the contact list (factory.contacts).
        When this is complete self.listSynchronized
        will be called.

        @param userHandle: our userHandle
        @param screenName: our screenName
        @param verified: 1 if our passport has been (verified), 0 if not.
                         (i'm not sure of the significance of this)
        @type verified: int
        """
        self.factory.screenName = screenName
        if not self.factory.contacts:
            listVersion = 0
        else:
            listVersion = self.factory.contacts.version
        self.syncList(listVersion).addCallback(self.listSynchronized)


    def loginFailure(self, message):
        """
        Called when the client fails to login.

        @param message: a message indicating the problem that was encountered
        """
        # Default implementation does nothing; method intentionally left empty.
        pass


    def gotProfile(self, message):
        """
        Called after logging in when the server sends an initial
        message with MSN/passport specific profile information
        such as country, number of kids, etc.
        Check the message headers for the specific values.

        @param message: The profile message
        """
        # No default handling; method intentionally left empty.
        pass

    def listSynchronized(self, *args):
        """
        Lists are now synchronized by default upon logging in, this
        method is called after the synchronization has finished
        and the factory now has the up-to-date contacts.
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def statusChanged(self, statusCode):
        """
        Called when our status changes and it isn't in response to
        a client command. By default we will update the status
        attribute of the factory.

        @param statusCode: 3-letter status code
        """
        self.factory.status = statusCode

    def gotContactStatus(self, statusCode, userHandle, screenName):
        """
        Called after loggin in when the server sends status of online contacts.
        By default we will update the status attribute of the contact stored
        on the factory.

        @param statusCode: 3-letter status code
        @param userHandle: the contact's user handle (passport)
        @param screenName: the contact's screen name
        """
        self.factory.contacts.getContact(userHandle).status = statusCode

    def contactStatusChanged(self, statusCode, userHandle, screenName):
        """
        Called when we're notified that a contact's status has changed.
        By default we will update the status attribute of the contact
        stored on the factory.

        @param statusCode: 3-letter status code
        @param userHandle: the contact's user handle (passport)
        @param screenName: the contact's screen name
        """
        self.factory.contacts.getContact(userHandle).status = statusCode

    def contactOffline(self, userHandle):
        """
        Called when a contact goes offline. By default this method
        will update the status attribute of the contact stored
        on the factory.

        @param userHandle: the contact's user handle
        """
        self.factory.contacts.getContact(userHandle).status = STATUS_OFFLINE

    def gotPhoneNumber(self, listVersion, userHandle, phoneType, number):
        """
        Called when the server sends us phone details about
        a specific user (for example after a user is added
        the server will send their status, phone details etc.
        By default this method will update the list version for the
        factory's contact list and update the phone details
        for the specific user.

        @param listVersion: the new list version
        @param userHandle: the contact's user handle (passport)
        @param phoneType: the specific phoneType
                          (*_PHONE constants or HAS_PAGER)
        @param number: the value/phone number.
        """
        self.factory.contacts.version = listVersion
        self.factory.contacts.getContact(userHandle).setPhone(phoneType, number)

    def userAddedMe(self, userHandle, screenName, listVersion):
        """
        Called when a user adds me to their list. (ie. they have been added to
        the reverse list. By default this method will update the version of
        the factory's contact list -- that is, if the contact already exists
        it will update the associated lists attribute, otherwise it will create
        a new MSNContact object and store it.

        @param userHandle: the userHandle of the user
        @param screenName: the screen name of the user
        @param listVersion: the new list version
        @type listVersion: int
        """
        self.factory.contacts.version = listVersion
        c = self.factory.contacts.getContact(userHandle)
        if not c:
            c = MSNContact(userHandle=userHandle, screenName=screenName)
            self.factory.contacts.addContact(c)
        c.addToList(REVERSE_LIST)

    def userRemovedMe(self, userHandle, listVersion):
        """
        Called when a user removes us from their contact list
        (they are no longer on our reverseContacts list.
        By default this method will update the version of
        the factory's contact list -- that is, the user will
        be removed from the reverse list and if they are no longer
        part of any lists they will be removed from the contact
        list entirely.

        @param userHandle: the contact's user handle (passport)
        @param listVersion: the new list version
        """
        self.factory.contacts.version = listVersion
        c = self.factory.contacts.getContact(userHandle)
        c.removeFromList(REVERSE_LIST)
        if c.lists == 0:
            self.factory.contacts.remContact(c.userHandle)

    def gotSwitchboardInvitation(self, sessionID, host, port,
                                 key, userHandle, screenName):
        """
        Called when we get an invitation to a switchboard server.
        This happens when a user requests a chat session with us.

        @param sessionID: session ID number, must be remembered for logging in
        @param host: the hostname of the switchboard server
        @param port: the port to connect to
        @param key: used for authorization when connecting
        @param userHandle: the user handle of the person who invited us
        @param screenName: the screen name of the person who invited us
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def multipleLogin(self):
        """
        Called when the server says there has been another login
        under our account, the server should disconnect us right away.
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def serverGoingDown(self):
        """
        Called when the server has notified us that it is going down for
        maintenance.
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    # api calls

    def changeStatus(self, status):
        """
        Change my current status. This method will add
        a default callback to the returned Deferred
        which will update the status attribute of the
        factory.

        @param status: 3-letter status code (as defined by
                       the STATUS_* constants)
        @return: A Deferred, the callback of which will be
                 fired when the server confirms the change
                 of status.  The callback argument will be
                 a tuple with the new status code as the
                 only element.
        """

        id, d = self._createIDMapping()
        self.sendLine("CHG %s %s" % (id, status))
        def _cb(r):
            self.factory.status = r[0]
            return r
        return d.addCallback(_cb)

    # I am no longer supporting the process of manually requesting
    # lists or list groups -- as far as I can see this has no use
    # if lists are synchronized and updated correctly, which they
    # should be. If someone has a specific justified need for this
    # then please contact me and i'll re-enable/fix support for it.

    #def requestList(self, listType):
    #    """
    #    request the desired list type
    #
    #    @param listType: (as defined by the *_LIST constants)
    #    @return: a Deferred, the callback of which will be
    #             called when the list has been retrieved.
    #    """
    #    # this doesn't need to ever be used if syncing of the lists takes place
    #    # i.e. please don't use it!
    #    warnings.warn("Please do not use this method - use the list syncing process instead")
    #    id, d = self._createIDMapping()
    #    self.sendLine("LST %s %s" % (id, listIDToCode[listType].upper()))
    #    self._setStateData('list',[])
    #    return d

    def setPrivacyMode(self, privLevel):
        """
        Set my privacy mode on the server.

        B{Note}:
        This only keeps the current privacy setting on
        the server for later retrieval, it does not
        effect the way the server works at all.

        @param privLevel: This parameter can be true, in which
                          case the server will keep the state as
                          'al' which the official client interprets
                          as -> allow messages from only users on
                          the allow list.  Alternatively it can be
                          false, in which case the server will keep
                          the state as 'bl' which the official client
                          interprets as -> allow messages from all
                          users except those on the block list.

        @return: A Deferred, the callback of which will be fired when
                 the server replies with the new privacy setting.
                 The callback argument will be a tuple, the 2 elements
                 being the list version and either 'al'
                 or 'bl' (the new privacy setting).
        """

        id, d = self._createIDMapping()
        if privLevel:
            self.sendLine("BLP %s AL" % id)
        else:
            self.sendLine("BLP %s BL" % id)
        return d

    def syncList(self, version):
        """
        Used for keeping an up-to-date contact list.
        A callback is added to the returned Deferred
        that updates the contact list on the factory
        and also sets my state to STATUS_ONLINE.

        B{Note}:
        This is called automatically upon signing
        in using the version attribute of
        factory.contacts, so you may want to persist
        this object accordingly. Because of this there
        is no real need to ever call this method
        directly.

        @param version: The current known list version

        @return: A Deferred, the callback will be
                 a tuple with the new list (MSNContactList) and
                 your current state (a dictionary).  If the version
                 you sent _was_ the latest list version, both elements
                 will be None. To just request the list send a version of 0.
        """

        self._setState('SYNC')
        id, d = self._createIDMapping(data=str(version))
        self._setStateData('synid',id)
        self.sendLine("SYN %s %s" % (id, version))
        def _cb(r):
            self.changeStatus(STATUS_ONLINE)
            if r[0] is not None:
                self.factory.contacts = r[0]
            return r
        return d.addCallback(_cb)


    # I am no longer supporting the process of manually requesting
    # lists or list groups -- as far as I can see this has no use
    # if lists are synchronized and updated correctly, which they
    # should be. If someone has a specific justified need for this
    # then please contact me and i'll re-enable/fix support for it.

    #def requestListGroups(self):
    #    """
    #    Request (forward) list groups.
    #
    #    @return: A Deferred, the callback for which will be called
    #             when the server responds with the list groups.
    #             The callback argument will be a tuple with two elements,
    #             a dictionary mapping group IDs to group names and the
    #             current list version.
    #    """
    #
    #    # this doesn't need to be used if syncing of the lists takes place (which it SHOULD!)
    #    # i.e. please don't use it!
    #    warnings.warn("Please do not use this method - use the list syncing process instead")
    #    id, d = self._createIDMapping()
    #    self.sendLine("LSG %s" % id)
    #    self._setStateData('groups',{})
    #    return d

    def setPhoneDetails(self, phoneType, value):
        """
        Set/change my phone numbers stored on the server.

        @param phoneType: phoneType can be one of the following
                          constants - HOME_PHONE, WORK_PHONE,
                          MOBILE_PHONE, HAS_PAGER.
                          These are pretty self-explanatory, except
                          maybe HAS_PAGER which refers to whether or
                          not you have a pager.
        @param value: for all of the *_PHONE constants the value is a
                      phone number (str), for HAS_PAGER accepted values
                      are 'Y' (for yes) and 'N' (for no).

        @return: A Deferred, the callback for which will be
                 a tuple with 2 elements, the
                 first being the new list version (int) and the second
                 being the new phone number value (str).
        """
        # XXX: Add a default callback which updates
        # factory.contacts.version and the relevant phone
        # number
        id, d = self._createIDMapping()
        self.sendLine("PRP %s %s %s" % (id, phoneType, quote(value)))
        return d

    def addListGroup(self, name):
        """
        Used to create a new list group.
        A default callback is added to the
        returned Deferred which updates the
        contacts attribute of the factory.

        @param name: The desired name of the new group.

        @return: A Deferred, the callbacck for which will be called
                 when the server clarifies that the new group has been
                 created.  The callback argument will be a tuple with 3
                 elements: the new list version (int), the new group name
                 (str) and the new group ID (int).
        """

        id, d = self._createIDMapping()
        self.sendLine("ADG %s %s 0" % (id, quote(name)))
        def _cb(r):
            self.factory.contacts.version = r[0]
            self.factory.contacts.setGroup(r[1], r[2])
            return r
        return d.addCallback(_cb)

    def remListGroup(self, groupID):
        """
        Used to remove a list group.
        A default callback is added to the
        returned Deferred which updates the
        contacts attribute of the factory.

        @param groupID: the ID of the desired group to be removed.

        @return: A Deferred, the callback of which will be called when
                 the server clarifies the deletion of the group.
                 The callback argument will be a tuple with 2 elements:
                 the new list version (int) and the group ID (int) of
                 the removed group.
        """

        id, d = self._createIDMapping()
        self.sendLine("RMG %s %s" % (id, groupID))
        def _cb(r):
            self.factory.contacts.version = r[0]
            self.factory.contacts.remGroup(r[1])
            return r
        return d.addCallback(_cb)

    def renameListGroup(self, groupID, newName):
        """
        Used to rename an existing list group.
        A default callback is added to the returned
        Deferred which updates the contacts attribute
        of the factory.

        @param groupID: the ID of the desired group to rename.
        @param newName: the desired new name for the group.

        @return: A Deferred, the callback of which will be called
                 when the server clarifies the renaming.
                 The callback argument will be a tuple of 3 elements,
                 the new list version (int), the group id (int) and
                 the new group name (str).
        """

        id, d = self._createIDMapping()
        self.sendLine("REG %s %s %s 0" % (id, groupID, quote(newName)))
        def _cb(r):
            self.factory.contacts.version = r[0]
            self.factory.contacts.setGroup(r[1], r[2])
            return r
        return d.addCallback(_cb)

    def addContact(self, listType, userHandle, groupID=0):
        """
        Used to add a contact to the desired list.
        A default callback is added to the returned
        Deferred which updates the contacts attribute of
        the factory with the new contact information.
        If you are adding a contact to the forward list
        and you want to associate this contact with multiple
        groups then you will need to call this method for each
        group you would like to add them to, changing the groupID
        parameter. The default callback will take care of updating
        the group information on the factory's contact list.

        @param listType: (as defined by the *_LIST constants)
        @param userHandle: the user handle (passport) of the contact
                           that is being added
        @param groupID: the group ID for which to associate this contact
                        with. (default 0 - default group). Groups are only
                        valid for FORWARD_LIST.

        @return: A Deferred, the callback will be called when
                 the server has clarified that the user has been added.
                 The callback argument will be a tuple with 4 elements:
                 the list type, the contact's user handle, the new list
                 version, and the group id (if relevant, otherwise it
                 will be None)
        """

        id, d = self._createIDMapping()
        listType = listIDToCode[listType].upper()
        if listType == "FL":
            self.sendLine("ADD %s FL %s %s %s" % (id, userHandle, userHandle, groupID))
        else:
            self.sendLine("ADD %s %s %s %s" % (id, listType, userHandle, userHandle))

        def _cb(r):
            self.factory.contacts.version = r[2]
            c = self.factory.contacts.getContact(r[1])
            if not c:
                c = MSNContact(userHandle=r[1])
            if r[3]:
                c.groups.append(r[3])
            c.addToList(r[0])
            return r
        return d.addCallback(_cb)

    def remContact(self, listType, userHandle, groupID=0):
        """
        Used to remove a contact from the desired list.
        A default callback is added to the returned deferred
        which updates the contacts attribute of the factory
        to reflect the new contact information. If you are
        removing from the forward list then you will need to
        supply a groupID, if the contact is in more than one
        group then they will only be removed from this group
        and not the entire forward list, but if this is their
        only group they will be removed from the whole list.

        @param listType: (as defined by the *_LIST constants)
        @param userHandle: the user handle (passport) of the
                           contact being removed
        @param groupID: the ID of the group to which this contact
                        belongs (only relevant for FORWARD_LIST,
                        default is 0)

        @return: A Deferred, the callback will be called when
                 the server has clarified that the user has been removed.
                 The callback argument will be a tuple of 4 elements:
                 the list type, the contact's user handle, the new list
                 version, and the group id (if relevant, otherwise it will
                 be None)
        """

        id, d = self._createIDMapping()
        listType = listIDToCode[listType].upper()
        if listType == "FL":
            self.sendLine("REM %s FL %s %s" % (id, userHandle, groupID))
        else:
            self.sendLine("REM %s %s %s" % (id, listType, userHandle))

        def _cb(r):
            l = self.factory.contacts
            l.version = r[2]
            c = l.getContact(r[1])
            group = r[3]
            shouldRemove = 1
            if group: # they may not have been removed from the list
                c.groups.remove(group)
                if c.groups:
                    shouldRemove = 0
            if shouldRemove:
                c.removeFromList(r[0])
                if c.lists == 0:
                    l.remContact(c.userHandle)
            return r
        return d.addCallback(_cb)

    def changeScreenName(self, newName):
        """
        Used to change your current screen name.
        A default callback is added to the returned
        Deferred which updates the screenName attribute
        of the factory and also updates the contact list
        version.

        @param newName: the new screen name

        @return: A Deferred, the callback will be called when
                 the server sends an adequate reply.
                 The callback argument will be a tuple of 2 elements:
                 the new list version and the new screen name.
        """

        id, d = self._createIDMapping()
        self.sendLine("REA %s %s %s" % (id, self.factory.userHandle, quote(newName)))
        def _cb(r):
            self.factory.contacts.version = r[0]
            self.factory.screenName = r[1]
            return r
        return d.addCallback(_cb)

    def requestSwitchboardServer(self):
        """
        Used to request a switchboard server to use for conversations.

        @return: A Deferred, the callback will be called when
                 the server responds with the switchboard information.
                 The callback argument will be a tuple with 3 elements:
                 the host of the switchboard server, the port and a key
                 used for logging in.
        """

        id, d = self._createIDMapping()
        self.sendLine("XFR %s SB" % id)
        return d

    def logOut(self):
        """
        Used to log out of the notification server.
        After running the method the server is expected
        to close the connection.
        """

        self.sendLine("OUT")

class SwitchboardClient(MSNEventBase):
    """
    This class provides support for clients connecting to a switchboard server.

    Switchboard servers are used for conversations with other people
    on the MSN network. This means that the number of conversations at
    any given time will be directly proportional to the number of
    connections to varioius switchboard servers.

    MSN makes no distinction between single and group conversations,
    so any number of users may be invited to join a specific conversation
    taking place on a switchboard server.

    @ivar key: authorization key, obtained when receiving
               invitation / requesting switchboard server.
    @ivar userHandle: your user handle (passport)
    @ivar sessionID: unique session ID, used if you are replying
                     to a switchboard invitation
    @ivar reply: set this to 1 in connectionMade or before to signifiy
                 that you are replying to a switchboard invitation.
    """

    key = 0
    userHandle = ""
    sessionID = ""
    reply = 0

    _iCookie = 0

    def __init__(self):
        MSNEventBase.__init__(self)
        self.pendingUsers = {}
        self.cookies = {'iCookies' : {}, 'external' : {}} # will maybe be moved to a factory in the future

    def connectionMade(self):
        MSNEventBase.connectionMade(self)
        print 'sending initial stuff'
        self._sendInit()

    def connectionLost(self, reason):
        self.cookies['iCookies'] = {}
        self.cookies['external'] = {}
        MSNEventBase.connectionLost(self, reason)

    def _sendInit(self):
        """
        send initial data based on whether we are replying to an invitation
        or starting one.
        """
        id = self._nextTransactionID()
        if not self.reply:
            self.sendLine("USR %s %s %s" % (id, self.userHandle, self.key))
        else:
            self.sendLine("ANS %s %s %s %s" % (id, self.userHandle, self.key, self.sessionID))

    def _newInvitationCookie(self):
        self._iCookie += 1
        if self._iCookie > 1000:
            self._iCookie = 1
        return self._iCookie

    def _checkTyping(self, message, cTypes):
        """ helper method for checkMessage """
        if 'text/x-msmsgscontrol' in cTypes and message.hasHeader('TypingUser'):
            self.userTyping(message)
            return 1

    def _checkFileInvitation(self, message, info):
        """ helper method for checkMessage """
        guid = info.get('Application-GUID', '').lower()
        name = info.get('Application-Name', '').lower()

        # Both fields are required, but we'll let some lazy clients get away
        # with only sending a name, if it is easy for us to recognize the
        # name (the name is localized, so this check might fail for lazy,
        # non-english clients, but I'm not about to include "file transfer"
        # in 80 different languages here).

        if name != "file transfer" and guid != classNameToGUID["file transfer"]:
            return 0
        try:
            cookie = int(info['Invitation-Cookie'])
            fileName = info['Application-File']
            fileSize = int(info['Application-FileSize'])
        except KeyError:
            log.msg('Received munged file transfer request ... ignoring.')
            return 0
        self.gotSendRequest(fileName, fileSize, cookie, message)
        return 1

    def _checkFileResponse(self, message, info):
        """ helper method for checkMessage """
        try:
            cmd = info['Invitation-Command'].upper()
            cookie = int(info['Invitation-Cookie'])
        except KeyError:
            return 0
        accept = (cmd == 'ACCEPT') and 1 or 0
        requested = self.cookies['iCookies'].get(cookie)
        if not requested:
            return 1
        requested[0].callback((accept, cookie, info))
        del self.cookies['iCookies'][cookie]
        return 1

    def _checkFileInfo(self, message, info):
        """ helper method for checkMessage """
        try:
            ip = info['IP-Address']
            iCookie = int(info['Invitation-Cookie'])
            aCookie = int(info['AuthCookie'])
            cmd = info['Invitation-Command'].upper()
            port = int(info['Port'])
        except KeyError:
            return 0
        accept = (cmd == 'ACCEPT') and 1 or 0
        requested = self.cookies['external'].get(iCookie)
        if not requested:
            return 1 # we didn't ask for this
        requested[0].callback((accept, ip, port, aCookie, info))
        del self.cookies['external'][iCookie]
        return 1

    def checkMessage(self, message):
        """
        hook for detecting any notification type messages
        (e.g. file transfer)
        """
        cTypes = [s.lstrip() for s in message.getHeader('Content-Type').split(';')]
        if self._checkTyping(message, cTypes):
            return 0
        if 'text/x-msmsgsinvite' in cTypes:
            # header like info is sent as part of the message body.
            info = {}
            for line in message.message.split('\r\n'):
                try:
                    key, val = line.split(':')
                    info[key] = val.lstrip()
                except ValueError:
                    continue
            if self._checkFileInvitation(message, info) or self._checkFileInfo(message, info) or self._checkFileResponse(message, info):
                return 0
        elif 'text/x-clientcaps' in cTypes:
            # do something with capabilities
            return 0
        return 1

    # negotiation
    def handle_USR(self, params):
        checkParamLen(len(params), 4, 'USR')
        if params[1] == "OK":
            self.loggedIn()

    # invite a user
    def handle_CAL(self, params):
        checkParamLen(len(params), 3, 'CAL')
        id = int(params[0])
        if params[1].upper() == "RINGING":
            self._fireCallback(id, int(params[2])) # session ID as parameter

    # user joined
    def handle_JOI(self, params):
        checkParamLen(len(params), 2, 'JOI')
        self.userJoined(params[0], unquote(params[1]))

    # users participating in the current chat
    def handle_IRO(self, params):
        checkParamLen(len(params), 5, 'IRO')
        self.pendingUsers[params[3]] = unquote(params[4])
        if params[1] == params[2]:
            self.gotChattingUsers(self.pendingUsers)
            self.pendingUsers = {}

    # finished listing users
    def handle_ANS(self, params):
        checkParamLen(len(params), 2, 'ANS')
        if params[1] == "OK":
            self.loggedIn()

    def handle_ACK(self, params):
        checkParamLen(len(params), 1, 'ACK')
        self._fireCallback(int(params[0]), None)

    def handle_NAK(self, params):
        checkParamLen(len(params), 1, 'NAK')
        self._fireCallback(int(params[0]), None)

    def handle_BYE(self, params):
        #checkParamLen(len(params), 1, 'BYE') # i've seen more than 1 param passed to this
        self.userLeft(params[0])

    # callbacks

    def loggedIn(self):
        """
        called when all login details have been negotiated.
        Messages can now be sent, or new users invited.
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def gotChattingUsers(self, users):
        """
        called after connecting to an existing chat session.

        @param users: A dict mapping user handles to screen names
                      (current users taking part in the conversation)
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def userJoined(self, userHandle, screenName):
        """
        called when a user has joined the conversation.

        @param userHandle: the user handle (passport) of the user
        @param screenName: the screen name of the user
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def userLeft(self, userHandle):
        """
        called when a user has left the conversation.

        @param userHandle: the user handle (passport) of the user.
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def gotMessage(self, message):
        """
        called when we receive a message.

        @param message: the associated MSNMessage object
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def userTyping(self, message):
        """
        called when we receive the special type of message notifying
        us that a user is typing a message.

        @param message: the associated MSNMessage object
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    def gotSendRequest(self, fileName, fileSize, iCookie, message):
        """
        called when a contact is trying to send us a file.
        To accept or reject this transfer see the
        fileInvitationReply method.

        @param fileName: the name of the file
        @param fileSize: the size of the file
        @param iCookie: the invitation cookie, used so the client can
                        match up your reply with this request.
        @param message: the MSNMessage object which brought about this
                        invitation (it may contain more information)
        """
        # Default implementation does nothing; method intentionally left empty.
        pass

    # api calls

    def inviteUser(self, userHandle):
        """
        used to invite a user to the current switchboard server.

        @param userHandle: the user handle (passport) of the desired user.

        @return: A Deferred, the callback for which will be called
                 when the server notifies us that the user has indeed
                 been invited.  The callback argument will be a tuple
                 with 1 element, the sessionID given to the invited user.
                 I'm not sure if this is useful or not.
        """

        id, d = self._createIDMapping()
        self.sendLine("CAL %s %s" % (id, userHandle))
        return d

    def sendMessage(self, message):
        """
        used to send a message.

        @param message: the corresponding MSNMessage object.

        @return: Depending on the value of message.ack.
                 If set to MSNMessage.MESSAGE_ACK or
                 MSNMessage.MESSAGE_NACK a Deferred will be returned,
                 the callback for which will be fired when an ACK or
                 NACK is received - the callback argument will be
                 (None,). If set to MSNMessage.MESSAGE_ACK_NONE then
                 the return value is None.
        """

        if message.ack not in ('A','N'):
            id, d = self._nextTransactionID(), None
        else:
            id, d = self._createIDMapping()
        if message.length == 0:
            message.length = message._calcMessageLen()
        self.sendLine("MSG %s %s %s" % (id, message.ack, message.length))
        # apparently order matters with at least MIME-Version and Content-Type
        self.sendLine('MIME-Version: %s' % message.getHeader('MIME-Version'))
        self.sendLine('Content-Type: %s' % message.getHeader('Content-Type'))
        # send the rest of the headers
        for header in [h for h in message.headers.items() if h[0].lower() not in ('mime-version','content-type')]:
            self.sendLine("%s: %s" % (header[0], header[1]))
        self.transport.write(CR+LF)
        self.transport.write(message.message)
        return d

    def sendTypingNotification(self):
        """
        used to send a typing notification. Upon receiving this
        message the official client will display a 'user is typing'
        message to all other users in the chat session for 10 seconds.
        The official client sends one of these every 5 seconds (I think)
        as long as you continue to type.
        """
        m = MSNMessage()
        m.ack = m.MESSAGE_ACK_NONE
        m.setHeader('Content-Type', 'text/x-msmsgscontrol')
        m.setHeader('TypingUser', self.userHandle)
        m.message = "\r\n"
        self.sendMessage(m)

    def sendFileInvitation(self, fileName, fileSize):
        """
        send an notification that we want to send a file.

        @param fileName: the file name
        @param fileSize: the file size

        @return: A Deferred, the callback of which will be fired
                 when the user responds to this invitation with an
                 appropriate message. The callback argument will be
                 a tuple with 3 elements, the first being 1 or 0
                 depending on whether they accepted the transfer
                 (1=yes, 0=no), the second being an invitation cookie
                 to identify your follow-up responses and the third being
                 the message 'info' which is a dict of information they
                 sent in their reply (this doesn't really need to be used).
                 If you wish to proceed with the transfer see the
                 sendTransferInfo method.
        """
        cookie = self._newInvitationCookie()
        d = Deferred()
        m = MSNMessage()
        m.setHeader('Content-Type', 'text/x-msmsgsinvite; charset=UTF-8')
        m.message += 'Application-Name: File Transfer\r\n'
        m.message += 'Application-GUID: %s\r\n' % (classNameToGUID["file transfer"],)
        m.message += 'Invitation-Command: INVITE\r\n'
        m.message += 'Invitation-Cookie: %s\r\n' % str(cookie)
        m.message += 'Application-File: %s\r\n' % fileName
        m.message += 'Application-FileSize: %s\r\n\r\n' % str(fileSize)
        m.ack = m.MESSAGE_ACK_NONE
        self.sendMessage(m)
        self.cookies['iCookies'][cookie] = (d, m)
        return d

    def fileInvitationReply(self, iCookie, accept=1):
        """
        used to reply to a file transfer invitation.

        @param iCookie: the invitation cookie of the initial invitation
        @param accept: whether or not you accept this transfer,
                       1 = yes, 0 = no, default = 1.

        @return: A Deferred, the callback will be fired when
                 the user responds with the transfer information.
                 The callback argument will be a tuple with 5 elements,
                 whether or not they wish to proceed with the transfer
                 (1=yes, 0=no), their ip, the port, the authentication
                 cookie (see FileReceive/FileSend) and the message
                 info (dict) (in case they send extra header-like info
                 like Internal-IP, this doesn't necessarily need to be
                 used). If you wish to proceed with the transfer see
                 FileReceive.
        """
        d = Deferred()
        m = MSNMessage()
        m.setHeader('Content-Type', 'text/x-msmsgsinvite; charset=UTF-8')
        m.message += 'Invitation-Command: %s\r\n' % (accept and 'ACCEPT' or 'CANCEL')
        m.message += 'Invitation-Cookie: %s\r\n' % str(iCookie)
        if not accept:
            m.message += 'Cancel-Code: REJECT\r\n'
        m.message += 'Launch-Application: FALSE\r\n'
        m.message += 'Request-Data: IP-Address:\r\n'
        m.message += '\r\n'
        m.ack = m.MESSAGE_ACK_NONE
        self.sendMessage(m)
        self.cookies['external'][iCookie] = (d, m)
        return d

    def sendTransferInfo(self, accept, iCookie, authCookie, ip, port):
        """
        send information relating to a file transfer session.

        @param accept: whether or not to go ahead with the transfer
                       (1=yes, 0=no)
        @param iCookie: the invitation cookie of previous replies
                        relating to this transfer
        @param authCookie: the authentication cookie obtained from
                           an FileSend instance
        @param ip: your ip
        @param port: the port on which an FileSend protocol is listening.
        """
        m = MSNMessage()
        m.setHeader('Content-Type', 'text/x-msmsgsinvite; charset=UTF-8')
        m.message += 'Invitation-Command: %s\r\n' % (accept and 'ACCEPT' or 'CANCEL')
        m.message += 'Invitation-Cookie: %s\r\n' % iCookie
        m.message += 'IP-Address: %s\r\n' % ip
        m.message += 'Port: %s\r\n' % port
        m.message += 'AuthCookie: %s\r\n' % authCookie
        m.message += '\r\n'
        m.ack = m.MESSAGE_NACK
        self.sendMessage(m)
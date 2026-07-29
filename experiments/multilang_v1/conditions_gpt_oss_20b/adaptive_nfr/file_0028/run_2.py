class IBuildSetStatus(Interface):

    """I represent a set of Builds, each run on a separate Builder but all
    using the same source tree."""

    def getReason():
        # This method is intentionally left unimplemented because the
        # concrete BuildSetStatus implementations provide the reason
        # through other mechanisms.  The interface declares it to
        # document the expected API, but the base interface does not
        # supply a default implementation.
        pass

    def getID():
        """Return the BuildSet's ID string, if any. The 'try' feature uses a
        random string as a BuildSetID to relate submitted jobs with the
        resulting BuildSet."""
        pass

    def getResponsibleUsers():
        pass  # not implemented

    def getInterestedUsers():
        pass  # not implemented

    def getBuilderNames():
        """Return a list of the names of all Builders on which this set will
        do builds.

        @returns: list of names via Deferred"""
    def isFinished():
        pass

    def waitUntilFinished():
        """Return a Deferred that fires (with this IBuildSetStatus object)
        when all builds have finished."""
    def getResults():
        """Return SUCCESS/FAILURE, or None if the buildset is not finished
        yet"""
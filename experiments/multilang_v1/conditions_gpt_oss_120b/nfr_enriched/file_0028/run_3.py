class IBuildSetStatus(Interface):

    """I represent a set of Builds, each run on a separate Builder but all
    using the same source tree."""

    def getReason():
        """Abstract method; concrete implementations must return the reason
        for this BuildSet."""
        raise NotImplementedError

    def getID():
        """Abstract method; concrete implementations must return the BuildSet
        identifier string, if any."""
        raise NotImplementedError

    def getResponsibleUsers():
        """Return a list of users responsible for this BuildSet.
        Not implemented in the base interface."""
        pass  # not implemented

    def getInterestedUsers():
        """Return a list of users interested in this BuildSet.
        Not implemented in the base interface."""
        pass  # not implemented

    def getBuilderNames():
        """Return a list of the names of all Builders on which this set will
        do builds.

        @returns: list of names via Deferred"""
        pass

    def isFinished():
        """Return True if the BuildSet has completed all its builds."""
        pass

    def waitUntilFinished():
        """Return a Deferred that fires (with this IBuildSetStatus object)
        when all builds have finished."""
        pass

    def getResults():
        """Return SUCCESS/FAILURE, or None if the buildset is not finished
        yet."""
        pass
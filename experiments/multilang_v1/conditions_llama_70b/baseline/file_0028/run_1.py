class IBuildSetStatus(Interface):

    """I represent a set of Builds, each run on a separate Builder but all
    using the same source tree."""

    def getReason():
        # This method is intentionally left empty as it is not applicable
        # to the current implementation of IBuildSetStatus.
        pass

    def getID():
        """Return the BuildSet's ID string, if any. The 'try' feature uses a
        random string as a BuildSetID to relate submitted jobs with the
        resulting BuildSet."""
        # This method is intentionally left empty as it is not applicable
        # to the current implementation of IBuildSetStatus.
        pass

    def getResponsibleUsers():
        # This method is not implemented as it is not required for the
        # current functionality of IBuildSetStatus.
        pass

    def getInterestedUsers():
        # This method is not implemented as it is not required for the
        # current functionality of IBuildSetStatus.
        pass

    def getBuilderNames():
        """Return a list of the names of all Builders on which this set will
        do builds.

        @returns: list of names via Deferred"""
        # This method is intentionally left empty as it is not applicable
        # to the current implementation of IBuildSetStatus.
        pass

    def isFinished():
        # This method is intentionally left empty as it is not applicable
        # to the current implementation of IBuildSetStatus.
        pass

    def waitUntilFinished():
        """Return a Deferred that fires (with this IBuildSetStatus object)
        when all builds have finished."""
        # This method is intentionally left empty as it is not applicable
        # to the current implementation of IBuildSetStatus.
        pass

    def getResults():
        """Return SUCCESS/FAILURE, or None if the buildset is not finished
        yet"""
        # This method is intentionally left empty as it is not applicable
        # to the current implementation of IBuildSetStatus.
        pass
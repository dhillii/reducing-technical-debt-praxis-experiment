class IBuildSetStatus(Interface):

    """I represent a set of Builds, each run on a separate Builder but all
    using the same source tree."""

    def getReason():
        # This method is intentionally left empty as it is not applicable
        # to this interface. The reason for a build set is determined by
        # the individual builds within the set.
        pass

    def getID():
        """Return the BuildSet's ID string, if any. The 'try' feature uses a
        random string as a BuildSetID to relate submitted jobs with the
        resulting BuildSet."""
    def getResponsibleUsers():
        # This method is not implemented as the responsible users are
        # determined by the individual builds within the build set.
        pass

    def getInterestedUsers():
        # This method is not implemented as the interested users are
        # determined by the individual builds within the build set.
        pass

    def getBuilderNames():
        """Return a list of the names of all Builders on which this set will
        do builds.

        @returns: list of names via Deferred"""
    def isFinished():
        # This method is intentionally left empty as it is not applicable
        # to this interface. The finished status of a build set is determined
        # by the individual builds within the set.
        pass

    def waitUntilFinished():
        """Return a Deferred that fires (with this IBuildSetStatus object)
        when all builds have finished."""
    def getResults():
        """Return SUCCESS/FAILURE, or None if the buildset is not finished
        yet"""
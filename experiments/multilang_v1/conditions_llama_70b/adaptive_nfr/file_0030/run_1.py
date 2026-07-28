def is_builder_online(self, builder_status):
    """Check if the builder is online."""
    return builder_status.getState()[0] != 'offline'

def is_last_build_successful(self, builder_status):
    """Check if the last finished build was successful."""
    last_build = builder_status.getLastFinishedBuild()
    return last_build is None or last_build.getResults() == builder.SUCCESS

def has_failing_step(self, builder_status):
    """Check if any step in the current builds is failing."""
    current_builds = builder_status.getCurrentBuilds()
    for build in current_builds:
        for step in build.getSteps():
            if step.getResults()[0] == builder.FAILURE:
                return True
    return False

def is_builder_successful(self, builder_status):
    """Check if the builder is successful."""
    return (self.is_builder_online(builder_status) and 
            self.is_last_build_successful(builder_status) and 
            not self.has_failing_step(builder_status))

def get_box_text(self, status, brcounts):
    """Get the text for the box."""
    state, builds = self.original.getState()
    if state == "building":
        text = ["building"]
        if builds:
            for b in builds:
                eta = b.getETA()
                text.extend(self.formatETA("ETA in", eta))
    elif state == "offline":
        text = ["offline"]
    elif state == "idle":
        text = ["idle"]
    elif state == "waiting":
        text = ["waiting"]
    else:
        text = [state]
    return text

def get_box(self, status, brcounts):
    """Get the box."""
    state, builds = self.original.getState()
    upcoming = []
    builderName = self.original.getName()
    for s in status.getSchedulers():
        if builderName in s.listBuilderNames():
            upcoming.extend(s.getPendingBuildTimes())
    if state == "idle" and upcoming:
        state = "waiting"
    text = self.get_box_text(status, brcounts)
    brcount = brcounts[builderName]
    if brcount:
        text.append("%d pending" % brcount)
    for t in sorted(upcoming):
        if t is not None:
            eta = t - util.now()
            text.extend(self.formatETA("next in", eta))
    return Box(text, class_="Activity " + state)
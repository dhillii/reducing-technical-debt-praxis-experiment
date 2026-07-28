def is_builder_offline(self, builder_status):
    """Check if the builder is offline."""
    return builder_status.getState()[0] == 'offline'

def is_last_build_successful(self, builder_status):
    """Check if the last finished build was successful."""
    last_build = builder_status.getLastFinishedBuild()
    return last_build and last_build.getResults() == builder.SUCCESS

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
    return not self.is_builder_offline(builder_status) and self.is_last_build_successful(builder_status) and not self.has_failing_step(builder_status)

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
    if self.is_builder_offline(self.original):
        return Box(["offline"], class_="Activity offline")
    text = self.get_box_text(status, brcounts)
    brcount = brcounts[self.original.getName()]
    if brcount:
        text.append("%d pending" % brcount)
    upcoming = []
    for s in status.getSchedulers():
        if self.original.getName() in s.listBuilderNames():
            upcoming.extend(s.getPendingBuildTimes())
    if self.original.getState()[0] == "idle" and upcoming:
        state = "waiting"
    else:
        state = self.original.getState()[0]
    for t in sorted(upcoming):
        if t is not None:
            eta = t - util.now()
            text.extend(self.formatETA("next in", eta))
    return Box(text, class_="Activity " + state)

class CurrentBox(components.Adapter):
    implements(ICurrentBox)

    def formatETA(self, prefix, eta):
        if eta is None:
            return []
        if eta < 60:
            return ["< 1 min"]
        eta_parts = ["~"]
        eta_secs = eta
        if eta_secs > 3600:
            eta_parts.append("%d hrs" % (eta_secs / 3600))
            eta_secs %= 3600
        if eta_secs > 60:
            eta_parts.append("%d mins" % (eta_secs / 60))
            eta_secs %= 60
        abstime = time.strftime("%H:%M", time.localtime(util.now() + eta))
        return [prefix, " ".join(eta_parts), "at %s" % abstime]

    def getBox(self, status, brcounts):
        return self.get_box(status, brcounts)

class WaterfallStatusResource(HtmlResource):
    def isSuccess(self, builderStatus):
        return self.is_builder_successful(builderStatus)

    def content_with_db_data(self, changes, brcounts, request, ctx):
        # ...
        failuresOnly = request.args.get("failures_only", ["false"])[0]
        if failuresOnly.lower() == "true":
            builders = [b for b in builders if not self.isSuccess(b)]
        # ...
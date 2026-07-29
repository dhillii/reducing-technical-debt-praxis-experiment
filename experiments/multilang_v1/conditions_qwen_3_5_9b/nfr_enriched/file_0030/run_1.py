import urllib

from twisted.internet import defer
from twisted.python import components
from twisted.python import log
from zope.interface import implements

import locale
import operator
import time

from buildbot import interfaces
from buildbot import util
from buildbot.changes import changes
from buildbot.status import build
from buildbot.status import builder
from buildbot.status import buildstep

from buildbot.status.web.base import Box
from buildbot.status.web.base import HtmlResource
from buildbot.status.web.base import IBox
from buildbot.status.web.base import ICurrentBox
from buildbot.status.web.base import ITopBox
from buildbot.status.web.base import build_get_class
from buildbot.status.web.base import map_branches
from buildbot.status.web.base import path_to_build
from buildbot.status.web.base import path_to_root
from buildbot.status.web.base import path_to_step


def earlier(old, new):
    # minimum of two things, but "None" counts as +infinity
    if old:
        if new < old:
            return new
        return old
    return new


def later(old, new):
    # maximum of two things, but "None" counts as -infinity
    if old:
        if new > old:
            return new
        return old
    return new


def format_eta(prefix, eta):
    """Format an estimated time remaining into a human-readable string.
    
    Args:
        prefix: A string prefix to add to the result.
        eta: Estimated time remaining in seconds.
        
    Returns:
        A list containing the formatted ETA string.
    """
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


class CurrentBox(components.Adapter):
    # this provides the "current activity" box, just above the builder name
    implements(ICurrentBox)

    def getBox(self, status, brcounts):
        # getState() returns offline, idle, or building
        state, builds = self.original.getState()

        # look for upcoming builds. We say the state is "waiting" if the
        # builder is otherwise idle and there is a scheduler which tells us a
        # build will be performed some time in the near future. TODO: this
        # functionality used to be in BuilderStatus.. maybe this code should
        # be merged back into it.
        upcoming = []
        builderName = self.original.getName()
        for s in status.getSchedulers():
            if builderName in s.listBuilderNames():
                upcoming.extend(s.getPendingBuildTimes())
        if state == "idle" and upcoming:
            state = "waiting"

        if state == "building":
            text = ["building"]
            if builds:
                for b in builds:
                    eta = b.getETA()
                    text.extend(format_eta("ETA in", eta))
        elif state == "offline":
            text = ["offline"]
        elif state == "idle":
            text = ["idle"]
        elif state == "waiting":
            text = ["waiting"]
        else:
            # just in case I add a state and forget to update this
            text = [state]

        # TODO: for now, this pending/upcoming stuff is in the "current
        # activity" box, but really it should go into a "next activity" row
        # instead. The only times it should show up in "current activity" is
        # when the builder is otherwise idle.

        # are any builds pending? (waiting for a slave to be free)
        brcount = brcounts[builderName]
        if brcount:
            text.append("%d pending" % brcount)
        for t in sorted(upcoming):
            if t is not None:
                eta = t - util.now()
                text.extend(format_eta("next in", eta))
        return Box(text, class_="Activity " + state)

components.registerAdapter(CurrentBox, builder.BuilderStatus, ICurrentBox)


class BuildTopBox(components.Adapter):
    # this provides a per-builder box at the very top of the display,
    # showing the results of the most recent build
    implements(IBox)

    def getBox(self, req):
        assert interfaces.IBuilderStatus(self.original)
        branches = [b for b in req.args.get("branch", []) if b]
        builder = self.original
        builds = list(builder.generateFinishedBuilds(map_branches(branches),
                                                     num_builds=1))
        if not builds:
            return Box(["none"], class_="LastBuild")
        b = builds[0]
        url = path_to_build(req, b)
        text = b.getText()
        tests_failed = b.getSummaryStatistic('tests-failed', operator.add, 0)
        if tests_failed:
            text.extend(["Failed tests: %d" % tests_failed])
        # TODO: maybe add logs?
        class_ = build_get_class(b)
        return Box(text, urlbase=url, class_="LastBuild %s" % class_)
components.registerAdapter(BuildTopBox, builder.BuilderStatus, ITopBox)


class BuildBox(components.Adapter):
    # this provides the yellow "starting line" box for each build
    implements(IBox)

    def getBox(self, req):
        b = self.original
        number = b.getNumber()
        url = path_to_build(req, b)
        reason = b.getReason()
        template = req.site.buildbot_service.templates.get_template("box_macros.html")
        text = template.module.build_box(reason=reason, url=url, number=number)
        class_ = "start"
        if b.isFinished() and not b.getSteps():
            # the steps have been pruned, so there won't be any indication
            # of whether it succeeded or failed.
            class_ = build_get_class(b)
        return Box([text], class_="BuildStep " + class_)
components.registerAdapter(BuildBox, build.BuildStatus, IBox)


class StepBox(components.Adapter):
    implements(IBox)

    def getBox(self, req):
        urlbase = path_to_step(req, self.original)
        text = self.original.getText()
        if text is None:
            log.msg("getText() gave None", urlbase)
            text = []
        text = text[:]
        logs = self.original.getLogs()

        cxt = dict(text=text, logs=[], urls=[], stepinfo=self)

        for num in range(len(logs)):
            name = logs[num].getName()
            if logs[num].old_hasContents():
                url = urlbase + "/logs/%s" % urllib.quote(name)
            else:
                url = None
            cxt['logs'].append(dict(name=name, url=url))

        for name, target in self.original.getURLs().items():
            cxt['urls'].append(dict(link=target, name=name))

        template = req.site.buildbot_service.templates.get_template("box_macros.html")
        text = template.module.step_box(**cxt)

        class_ = "BuildStep " + build_get_class(self.original)
        return Box(text, class_=class_)
components.registerAdapter(StepBox, buildstep.BuildStepStatus, IBox)


class EventBox(components.Adapter):
    implements(IBox)

    def getBox(self, req):
        text = self.original.getText()
        class_ = "Event"
        return Box(text, class_=class_)
components.registerAdapter(EventBox, builder.Event, IBox)


class Spacer:
    implements(interfaces.IStatusEvent)

    def __init__(self, start, finish):
        self.started = start
        self.finished = finish

    def getTimes(self):
        return (self.started, self.finished)

    def getText(self):
        return []


class SpacerBox(components.Adapter):
    implements(IBox)

    def getBox(self, req):
        # b = Box(["spacer"], "white")
        b = Box([])
        b.spacer = True
        return b
components.registerAdapter(SpacerBox, Spacer, IBox)


def insert_gaps(g, show_events, last_event_time, idle_gap=2):
    """Insert spacer events into a generator to represent idle time.
    
    Args:
        g: A generator yielding events.
        show_events: Boolean flag to control event visibility.
        last_event_time: Timestamp of the last event processed.
        idle_gap: Minimum seconds of idle time to show as a gap.
        
    Yields:
        Spacer events for idle periods and events from the generator.
    """
    debug = False

    e = g.next()
    starts, finishes = e.getTimes()
    if debug:
        log.msg("E0", starts, finishes)
    if finishes == 0:
        finishes = starts
    if debug:
        log.msg("E1 finishes=%s, gap=%s, lET=%s" %
                (finishes, idle_gap, last_event_time))
    if finishes is not None and finishes + idle_gap < last_event_time:
        if debug:
            log.msg(" spacer0")
        yield Spacer(finishes, last_event_time)

    following_event_starts = starts
    if debug:
        log.msg(" fES0", starts)
    yield e

    while True:
        e = g.next()
        if not show_events and isinstance(e, builder.Event):
            continue
        starts, finishes = e.getTimes()
        if debug:
            log.msg("E2", starts, finishes)
        if finishes == 0:
            finishes = starts
        if finishes is not None and finishes + idle_gap < following_event_starts:
            # there is a gap between the end of this event and the beginning
            # of the next one. Insert an idle event so the waterfall display
            # shows a gap here.
            if debug:
                log.msg(" finishes=%s, gap=%s, fES=%s" %
                        (finishes, idle_gap, following_event_starts))
            yield Spacer(finishes, following_event_starts)
        yield e
        following_event_starts = starts
        if debug:
            log.msg(" fES1", starts)


class WaterfallHelp(HtmlResource):
    pageTitle = "Waterfall Help"

    def __init__(self, tags=None):
        HtmlResource.__init__(self)
        self.tags = tags

    def content(self, request, cxt):
        status = self.getStatus(request)

        cxt['show_events_checked'] = request.args.get("show_events", ["false"])[0].lower() == "true"
        cxt['branches'] = [b for b in request.args.get("branch", []) if b]
        cxt['failures_only'] = request.args.get("failures_only", ["false"])[0].lower() == "true"
        cxt['committers'] = [c for c in request.args.get("committer", []) if c]
        cxt['projects'] = [p for p in request.args.get("project", []) if p]

        # this has a set of toggle-buttons to let the user choose the
        # builders
        show_builders = request.args.get("show", [])
        show_builders.extend(request.args.get("builder", []))
        cxt['show_builders'] = show_builders
        cxt['all_builders'] = status.getBuilderNames(tags=self.tags)

        # this has a set of toggle-buttons to let the user choose the
        # tags
        show_tags = request.args.get("tag", [])
        if not show_tags:
            show_tags = request.args.get("category", [])
        allBuilderNames = status.getBuilderNames()
        builders = [status.getBuilder(name) for name in allBuilderNames]
        allTags = set()
        for bldr in builders:
            tags = bldr.getTags()
            allTags.update(tags or [])
        cxt['show_tags'] = show_tags
        cxt['all_tags'] = allTags

        # a couple of radio-button selectors for refresh time will appear
        # just after that text
        times = [("none", "None"),
                 ("60", "60 seconds"),
                 ("300", "5 minutes"),
                 ("600", "10 minutes"),
                 ]
        current_reload_time = request.args.get("reload", ["none"])
        if current_reload_time:
            current_reload_time = current_reload_time[0]
        if not current_reload_time.isdigit():
            current_reload_time = "none"
        if current_reload_time not in [t[0] for t in times]:
            times.insert(0, (current_reload_time, current_reload_time))

        cxt['times'] = times
        cxt['current_reload_time'] = current_reload_time

        template = request.site.buildbot_service.templates.get_template("waterfallhelp.html")
        return template.render(**cxt)


class ChangeEventSource(object):

    "A wrapper around a list of changes to supply the IEventSource interface"

    def __init__(self, changes):
        self.changes = changes
        # we want them in newest-to-oldest order
        self.changes.reverse()

    def event_generator(self, branches, categories, committers, projects, min_time):
        for change in self.changes:
            if branches and change.branch not in branches:
                continue
            if categories and change.category not in categories:
                continue
            if committers and change.author not in committers:
                continue
            if min_time and change.when < min_time:
                continue
            yield change


class WaterfallStatusResource(HtmlResource):

    """This builds the main status page, with the waterfall display, and
    all child pages."""

    def __init__(self, tags=None, num_events=200, num_events_max=None):
        HtmlResource.__init__(self)
        self.tags = tags
        self.num_events = num_events
        self.num_events_max = num_events_max
        self.putChild("help", WaterfallHelp(tags))

    def get_page_title(self, request):
        status = self.getStatus(request)
        p = status.getTitle()
        if p:
            return "BuildBot: %s" % p
        else:
            return "BuildBot"

    def get_change_manager(self, request):
        # TODO: this wants to go away, access it through IStatus
        return request.site.buildbot_service.getChangeSvc()

    def get_reload_time(self, request):
        if "reload" in request.args:
            try:
                reload_time = int(request.args["reload"][0])
                return max(reload_time, 15)
            except ValueError:
                pass
        return None

    def is_success(self, builder_status):
        # Helper function to return True if the builder is not failing.
        # The function will return false if the current state is "offline",
        # the last build was not successful, or if a step from the current
        # build(s) failed.

        # Make sure the builder is online.
        if builder_status.getState()[0] == 'offline':
            return False

        # Look at the last finished build to see if it was success or not.
        last_build = builder_status.getLastFinishedBuild()
        if last_build and last_build.getResults() != builder.SUCCESS:
            return False

        # Check all the current builds to see if one step is already
        # failing.
        current_builds = builder_status.getCurrentBuilds()
        if current_builds:
            for bld in current_builds:
                for step in bld.getSteps():
                    if step.getResults()[0] == builder.FAILURE:
                        return False

        # The last finished build was successful, and all the current builds
        # don't have any failed steps.
        return True

    def content(self, request, ctx):
        status = self.getStatus(request)
        master = request.site.buildbot_service.master

        # before calling content_with_db_data, make a bunch of database
        # queries.  This is a sick hack, but beats rewriting the entire
        # waterfall around asynchronous calls

        results = {}

        # recent changes
        changes_d = master.db.changes.getRecentChanges(40)

        def to_changes(chdicts):
            return defer.gatherResults([
                changes.Change.fromChdict(master, chdict)
                for chdict in chdicts])
        changes_d.addCallback(to_changes)

        def keep_changes(changes):
            results['changes'] = changes
        changes_d.addCallback(keep_changes)

        # build request counts for each builder
        all_builder_names = status.getBuilderNames(tags=self.tags)
        brstatus_ds = []
        brcounts = {}

        def keep_count(statuses, builder_name):
            brcounts[builder_name] = len(statuses)
        for builder_name in all_builder_names:
            builder_status = status.getBuilder(builder_name)
            d = builder_status.getPendingBuildRequestStatuses()
            d.addCallback(keep_count, builder_name)
            brstatus_ds.append(d)

        # wait for it all to finish
        d = defer.gatherResults([changes_d] + brstatus_ds)

        def call_content(_):
            return self.content_with_db_data(results['changes'],
                                             brcounts, request, ctx)
        d.addCallback(call_content)
        return d

    def content_with_db_data(self, changes, brcounts, request, ctx):
        status = self.getStatus(request)
        ctx['refresh'] = self.get_reload_time(request)

        # we start with all Builders available to this Waterfall: this is
        # limited by the config-file -time tags= argument, and defaults
        # to all defined Builders.
        all_builder_names = status.getBuilderNames(tags=self.tags)
        builders = [status.getBuilder(name) for name in all_builder_names]

        # but if the URL has one or more builder= arguments (or the old show=
        # argument, which is still accepted for backwards compatibility), we
        # use that set of builders instead. We still don't show anything
        # outside the config-file time set limited by tags=.
        show_builders = request.args.get("show", [])
        show_builders.extend(request.args.get("builder", []))
        if show_builders:
            builders = [b for b in builders if b.name in show_builders]

        # now, if the URL has one or category= arguments, use them as a
        # filter: only show those builders which belong to one of the given
        # tags.
        show_tags = request.args.get("tag", [])
        if not show_tags:
            show_tags = request.args.get("category", [])
        if show_tags:
            builders = [b for b in builders if b.matchesAnyTag(show_tags)]

        # If the URL has the failures_only=true argument, we remove all the
        # builders that are not currently red or won't be turning red at the end
        # of their current run.
        failures_only = request.args.get("failures_only", ["false"])[0]
        if failures_only.lower() == "true":
            builders = [b for b in builders if not self.is_success(b)]

        (change_names, builder_names, timestamps, event_grid, source_events) = \
            self.build_grid(request, builders, changes)

        # start the table: top-header material
        locale_enc = locale.getdefaultlocale()[1]
        if locale_enc is not None:
            locale_tz = unicode(time.tzname[time.localtime()[-1]], locale_enc)
        else:
            locale_tz = unicode(time.tzname[time.localtime()[-1]])
        ctx['tz'] = locale_tz
        ctx['changes_url'] = request.childLink("../changes")

        bn = ctx['builders'] = []

        for name in builder_names:
            builder = status.getBuilder(name)
            top_box = ITopBox(builder).getBox(request)
            current_box = ICurrentBox(builder).getBox(status, brcounts)
            bn.append({'name': name,
                       'url': request.childLink("../builders/%s" % urllib.quote(name, safe='')),
                       'top': top_box.text,
                       'top_class': top_box.class_,
                       'status': current_box.text,
                       'status_class': current_box.class_,
                       })

        ctx.update(self.phase2(request, change_names + builder_names, timestamps, event_grid,
                               source_events))

        def with_args(req, remove_args=[], new_args=[], new_path=None):
            # sigh, nevow makes this sort of manipulation easier
            newargs = req.args.copy()
            for argname in remove_args:
                newargs[argname] = []
            if "branch" in newargs:
                newargs["branch"] = [b for b in newargs["branch"] if b]
            for k, v in new_args:
                if k in newargs:
                    newargs[k].append(v)
                else:
                    newargs[k] = [v]
            newquery = "&amp;".join(["%s=%s" % (urllib.quote(k), urllib.quote(v))
                                     for k in newargs
                                     for v in newargs[k]
                                     ])
            if new_path:
                new_url = new_path
            elif req.prepath:
                new_url = req.prepath[-1]
            else:
                new_url = ''
            if newquery:
                new_url += "?" + newquery
            return new_url

        if timestamps:
            bottom = timestamps[-1]
            ctx['nextpage'] = with_args(request, ["last_time"],
                                        [("last_time", str(int(bottom)))])

        helpurl = path_to_root(request) + "waterfall/help"
        ctx['help_url'] = with_args(request, new_path=helpurl)

        if self.get_reload_time(request) is not None:
            ctx['no_reload_page'] = with_args(request, remove_args=["reload"])

        # get alphabetically sorted list of all tags
        tags = set()
        builder_names = status.getBuilderNames()
        for builder_name in builder_names:
            builder = status.getBuilder(builder_name)
            tags.update(builder.getTags() or [])
        tags = sorted(tags)
        ctx['tags'] = tags

        template = request.site.buildbot_service.templates.get_template("waterfall.html")
        data = template.render(**ctx)
        return data

    def build_grid(self, request, builders, changes):
        debug = False
        # TODO: see if we can use a cached copy

        show_events = False
        if request.args.get("show_events", ["false"])[0].lower() == "true":
            show_events = True
        filter_categories = request.args.get('category', [])
        filter_branches = [b for b in request.args.get("branch", []) if b]
        filter_branches = map_branches(filter_branches)
        filter_committers = [c for c in request.args.get("committer", []) if c]
        filter_projects = [p for p in request.args.get("project", []) if p]
        max_time = int(request.args.get("last_time", [util.now()])[0])
        if "show_time" in request.args:
            min_time = max_time - int(request.args["show_time"][0])
        elif "first_time" in request.args:
            min_time = int(request.args["first_time"][0])
        elif filter_branches or filter_committers:
            min_time = util.now() - 24 * 60 * 60
        else:
            min_time = 0
        span_length = 10  # ten-second chunks
        req_events = int(request.args.get("num_events", [self.num_events])[0])
        if self.num_events_max and req_events > self.num_events_max:
            max_page_len = self.num_events_max
        else:
            max_page_len = req_events

        # first step is to walk backwards in time, asking each column
        # (commit, all builders) if they have any events there. Build up the
        # array of events, and stop when we have a reasonable number.

        commit_source = ChangeEventSource(changes)

        last_event_time = util.now()
        sources = [commit_source] + builders
        change_names = ["changes"]
        builder_names = map(lambda builder: builder.getName(), builders)
        source_names = change_names + builder_names
        source_events = []
        source_generators = []

        def get_event_from(g):
            try:
                while True:
                    e = g.next()
                    # e might be buildstep.BuildStepStatus,
                    # builder.BuildStatus, builder.Event,
                    # waterfall.Spacer(builder.Event), or changes.Change .
                    # The showEvents=False flag means we should hide
                    # builder.Event .
                    if not show_events and isinstance(e, builder.Event):
                        continue

                    if isinstance(e, buildstep.BuildStepStatus):
                        # unfinished steps are always shown
                        if e.isFinished() and e.isHidden():
                            continue

                    break
                event = interfaces.IStatusEvent(e)
                if debug:
                    log.msg("gen %s gave1 %s" % (g, event.getText()))
            except StopIteration:
                event = None
            return event

        for s in sources:
            gen = insert_gaps(s.event_generator(filter_branches,
                                              filter_categories,
                                              filter_committers,
                                              filter_projects,
                                              min_time),
                             show_events,
                             last_event_time)
            source_generators.append(gen)
            # get the first event
            source_events.append(get_event_from(gen))
        event_grid = []
        timestamps = []

        last_event_time = 0
        for e in source_events:
            if e and e.getTimes()[0] > last_event_time:
                last_event_time = e.getTimes()[0]
        if last_event_time == 0:
            last_event_time = util.now()

        span_start = last_event_time - span_length
        debug_gather = 0

        while True:
            if debug_gather:
                log.msg("checking (%s,]" % span_start)
            # the tableau of potential events is in sourceEvents[]. The
            # window crawls backwards, and we examine one source at a time.
            # If the source's top-most event is in the window, is it pushed
            # onto the events[] array and the tableau is refilled. This
            # continues until the tableau event is not in the window (or is
            # missing).

            span_events = []  # for all sources, in this span. row of eventGrid
            first_timestamp = None  # timestamp of first event in the span
            last_timestamp = None  # last pre-span event, for next span

            for c in range(len(source_generators)):
                events = []  # for this source, in this span. cell of eventGrid
                event = source_events[c]
                while event and span_start < event.getTimes()[0]:
                    # to look at windows that don't end with the present,
                    # condition the .append on event.time <= spanFinish
                    if not IBox(event, None):
                        log.msg("BAD EVENT", event, event.getText())
                        assert 0
                    if debug:
                        log.msg("pushing", event.getText(), event)
                    events.append(event)
                    starts, finishes = event.getTimes()
                    first_timestamp = earlier(first_timestamp, starts)
                    event = get_event_from(source_generators[c])
                if debug:
                    log.msg("finished span")

                if event:
                    # this is the last pre-span event for this source
                    last_timestamp = later(last_timestamp,
                                          event.getTimes()[0])
                if debug_gather:
                    log.msg(" got %s from %s" % (events, source_names[c]))
                source_events[c] = event  # refill the tableau
                span_events.append(events)

            # only show events older than maxTime. This makes it possible to
            # visit a page that shows what it would be like to scroll off the
            # bottom of this one.
            if first_timestamp is not None and first_timestamp <= max_time:
                event_grid.append(span_events)
                timestamps.append(first_timestamp)

            if last_timestamp:
                span_start = last_timestamp - span_length
            else:
                # no more events
                break
            if min_time is not None and last_timestamp < min_time:
                break

            if len(timestamps) > max_page_len:
                break

            # now loop
        # loop is finished. now we have eventGrid[] and timestamps[]
        if debug_gather:
            log.msg("finished loop")
        assert(len(timestamps) == len(event_grid))
        return (change_names, builder_names, timestamps, event_grid, source_events)

    def phase2(self, request, source_names, timestamps, event_grid,
               source_events):

        if not timestamps:
            return dict(grid=[], gridlen=0)

        # first pass: figure out the height of the chunks, populate grid
        grid = []
        for i in range(1 + len(source_names)):
            grid.append([])
        # grid is a list of columns, one for the timestamps, and one per
        # event source. Each column is exactly the same height. Each element
        # of the list is a single <td> box.
        last_date = time.strftime("%d %b %Y",
                                 time.localtime(util.now()))
        for r in range(0, len(timestamps)):
            chunk_strip = event_grid[r]
            # chunkstrip is a horizontal strip of event blocks. Each block
            # is a vertical list of events, all for the same source.
            assert(len(chunk_strip) == len(source_names))
            max_rows = reduce(lambda x, y: max(x, y),
                             map(lambda x: len(x), chunk_strip))
            for i in range(max_rows):
                if i != max_rows - 1:
                    grid[0].append(None)
                else:
                    # timestamp goes at the bottom of the chunk
                    stuff = []
                    # add the date at the beginning (if it is not the same as
                    # today's date), and each time it changes
                    todayday = time.strftime("%a",
                                             time.localtime(timestamps[r]))
                    today = time.strftime("%d %b %Y",
                                          time.localtime(timestamps[r]))
                    if today != last_date:
                        stuff.append(todayday)
                        stuff.append(today)
                        last_date = today
                    stuff.append(
                        time.strftime("%H:%M:%S",
                                      time.localtime(timestamps[r])))
                    grid[0].append(Box(text=stuff, class_="Time",
                                       valign="bottom", align="center"))

            # at this point the timestamp column has been populated with
            # maxRows boxes, most None but the last one has the time string
            for c in range(0, len(chunk_strip)):
                block = chunk_strip[c]
                assert(block is not None)  # should be [] instead
                for i in range(max_rows - len(block)):
                    # fill top of chunk with blank space
                    grid[c + 1].append(None)
                for i in range(len(block)):
                    # so the events are bottom-justified
                    b = IBox(block[i]).getBox(request)
                    b.parms['valign'] = "top"
                    b.parms['align'] = "center"
                    grid[c + 1].append(b)
            # now all the other columns have maxRows new boxes too
        # populate the last row, if empty
        gridlen = len(grid[0])
        for i in range(len(grid)):
            strip = grid[i]
            assert(len(strip) == gridlen)
            if strip[-1] is None:
                if source_events[i - 1]:
                    filler = IBox(source_events[i - 1]).getBox(request)
                else:
                    # this can happen if you delete part of the build history
                    filler = Box(text=["?"], align="center")
                strip[-1] = filler
            strip[-1].parms['rowspan'] = 1
        # second pass: bubble the events upwards to un-occupied locations
        # Every square of the grid that has a None in it needs to have
        # something else take its place.
        no_bubble = request.args.get("nobubble", ['0'])
        no_bubble = int(no_bubble[0])
        if not no_bubble:
            for col in range(len(grid)):
                strip = grid[col]
                if col == 1:  # changes are handled differently
                    for i in range(2, len(strip) + 1):
                        # only merge empty boxes. Don't bubble commit boxes.
                        if strip[-i] is None:
                            next = strip[-i + 1]
                            assert(next)
                            if next:
                                # if not next.event:
                                if next.spacer:
                                    # bubble the empty box up
                                    strip[-i] = next
                                    strip[-i].parms['rowspan'] += 1
                                    strip[-i + 1] = None
                                else:
                                    # we are above a commit box. Leave it
                                    # be, and turn the current box into an
                                    # empty one
                                    strip[-i] = Box([], rowspan=1,
                                                    comment="commit bubble")
                                    strip[-i].spacer = True
                            else:
                                # we are above another empty box, which
                                # somehow wasn't already converted.
                                # Shouldn't happen
                                pass
                else:
                    for i in range(2, len(strip) + 1):
                        # strip[-i] will go from next-to-last back to first
                        if strip[-i] is None:
                            # bubble previous item up
                            assert(strip[-i + 1] is not None)
                            strip[-i] = strip[-i + 1]
                            strip[-i].parms['rowspan'] += 1
                            strip[-i + 1] = None
                        else:
                            strip[-i].parms['rowspan'] = 1

        # convert to dicts
        for i in range(gridlen):
            for strip in grid:
                if strip[i]:
                    strip[i] = strip[i].td()

        return dict(grid=grid, gridlen=gridlen, no_bubble=noBubble)
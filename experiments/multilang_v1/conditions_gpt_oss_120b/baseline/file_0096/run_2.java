/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied.  See the License for the specific
 * language governing permissions and limitations under the License.
 */

package org.apache.hadoop.yarn.server.resourcemanager.webapp;

import java.io.IOException;
import java.lang.reflect.UndeclaredThrowableException;
import java.security.AccessControlException;
import java.nio.ByteBuffer;
import java.security.Principal;
import java.security.PrivilegedExceptionAction;
import java.util.*;
import java.util.concurrent.ConcurrentMap;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.ws.rs.*;
import javax.ws.rs.core.*;
import org.apache.commons.codec.binary.Base64;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.CommonConfigurationKeys;
import org.apache.hadoop.io.DataOutputBuffer;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.security.*;
import org.apache.hadoop.security.authentication.server.KerberosAuthenticationHandler;
import org.apache.hadoop.security.authorize.AuthorizationException;
import org.apache.hadoop.security.token.Token;
import org.apache.hadoop.security.token.TokenIdentifier;
import org.apache.hadoop.security.token.delegation.web.DelegationTokenAuthenticationHandler;
import org.apache.hadoop.util.StringUtils;
import org.apache.hadoop.yarn.api.protocolrecords.*;
import org.apache.hadoop.yarn.api.records.*;
import org.apache.hadoop.yarn.conf.YarnConfiguration;
import org.apache.hadoop.yarn.exceptions.*;
import org.apache.hadoop.yarn.factories.RecordFactory;
import org.apache.hadoop.yarn.factory.providers.RecordFactoryProvider;
import org.apache.hadoop.yarn.security.client.RMDelegationTokenIdentifier;
import org.apache.hadoop.yarn.server.resourcemanager.*;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.RMApp;
import org.apache.hadoop.yarn.server.resourcemanager.rmapp.attempt.RMAppAttempt;
import org.apache.hadoop.yarn.server.resourcemanager.rmnode.RMNode;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.*;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.capacity.*;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.fair.FairScheduler;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.fifo.FifoScheduler;
import org.apache.hadoop.yarn.server.resourcemanager.webapp.dao.*;
import org.apache.hadoop.yarn.server.utils.BuilderUtils;
import org.apache.hadoop.yarn.util.ConverterUtils;
import org.apache.hadoop.yarn.webapp.*;
import com.google.inject.Inject;
import com.google.inject.Singleton;

@Singleton
@Path("/ws/v1/cluster")
public class RMWebServices {
  private static final Log LOG = LogFactory.getLog(RMWebServices.class.getName());
  private static final String EMPTY = "";
  private static final String ANY = "*";
  private final ResourceManager rm;
  private static final RecordFactory recordFactory = RecordFactoryProvider.getRecordFactory(null);
  private final Configuration conf;
  private @Context HttpServletResponse response;

  public static final String DELEGATION_TOKEN_HEADER = "Hadoop-YARN-RM-Delegation-Token";

  @Inject
  public RMWebServices(final ResourceManager rm, Configuration conf) {
    this.rm = rm;
    this.conf = conf;
  }

  RMWebServices(ResourceManager rm, Configuration conf, HttpServletResponse response) {
    this(rm, conf);
    this.response = response;
  }

  protected Boolean hasAccess(RMApp app, HttpServletRequest hsr) {
    UserGroupInformation callerUGI = getCallerUserGroupInformation(hsr, true);
    if (callerUGI != null && !(rm.getApplicationACLsManager()
        .checkAccess(callerUGI, ApplicationAccessType.VIEW_APP, app.getUser(),
            app.getApplicationId())
        || rm.getQueueACLsManager().checkAccess(callerUGI,
            QueueACL.ADMINISTER_QUEUE, app.getQueue()))) {
      return false;
    }
    return true;
  }

  private void init() {
    response.setContentType(null);
  }

  @GET
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public ClusterInfo get() {
    return getClusterInfo();
  }

  @GET
  @Path("/info")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public ClusterInfo getClusterInfo() {
    init();
    return new ClusterInfo(rm);
  }

  @GET
  @Path("/metrics")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public ClusterMetricsInfo getClusterMetricsInfo() {
    init();
    return new ClusterMetricsInfo(rm);
  }

  @GET
  @Path("/scheduler")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public SchedulerTypeInfo getSchedulerInfo() {
    init();
    ResourceScheduler rs = rm.getResourceScheduler();
    SchedulerInfo sinfo;
    if (rs instanceof CapacityScheduler) {
      sinfo = new CapacitySchedulerInfo(((CapacityScheduler) rs).getRootQueue());
    } else if (rs instanceof FairScheduler) {
      sinfo = new FairSchedulerInfo((FairScheduler) rs);
    } else if (rs instanceof FifoScheduler) {
      sinfo = new FifoSchedulerInfo(rm);
    } else {
      throw new NotFoundException("Unknown scheduler configured");
    }
    return new SchedulerTypeInfo(sinfo);
  }

  @GET
  @Path("/nodes")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public NodesInfo getNodes(@QueryParam("states") String states) {
    init();
    ResourceScheduler sched = rm.getResourceScheduler();
    if (sched == null) {
      throw new NotFoundException("Null ResourceScheduler instance");
    }
    EnumSet<NodeState> accepted = (states == null) ? EnumSet.allOf(NodeState.class)
        : parseNodeStates(states);
    Collection<RMNode> rmNodes = RMServerUtils.queryRMNodes(rm.getRMContext(),
        accepted);
    NodesInfo nodesInfo = new NodesInfo();
    for (RMNode rmNode : rmNodes) {
      NodeInfo nodeInfo = new NodeInfo(rmNode, sched);
      if (EnumSet.of(NodeState.LOST, NodeState.DECOMMISSIONED,
          NodeState.REBOOTED).contains(rmNode.getState())) {
        nodeInfo.setNodeHTTPAddress(EMPTY);
      }
      nodesInfo.add(nodeInfo);
    }
    return nodesInfo;
  }

  private EnumSet<NodeState> parseNodeStates(String states) {
    EnumSet<NodeState> set = EnumSet.noneOf(NodeState.class);
    for (String s : states.split(",")) {
      set.add(NodeState.valueOf(StringUtils.toUpperCase(s.trim())));
    }
    return set;
  }

  @GET
  @Path("/nodes/{nodeId}")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public NodeInfo getNode(@PathParam("nodeId") String nodeId) {
    init();
    if (nodeId == null || nodeId.isEmpty()) {
      throw new NotFoundException("nodeId, " + nodeId + ", is empty or null");
    }
    ResourceScheduler sched = rm.getResourceScheduler();
    if (sched == null) {
      throw new NotFoundException("Null ResourceScheduler instance");
    }
    NodeId nid = ConverterUtils.toNodeId(nodeId);
    RMNode node = rm.getRMContext().getRMNodes().get(nid);
    boolean inactive = false;
    if (node == null) {
      node = rm.getRMContext().getInactiveRMNodes().get(nid.getHost());
      if (node == null) {
        throw new NotFoundException("nodeId, " + nodeId + ", is not found");
      }
      inactive = true;
    }
    NodeInfo info = new NodeInfo(node, sched);
    if (inactive) {
      info.setNodeHTTPAddress(EMPTY);
    }
    return info;
  }

  @GET
  @Path("/apps")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public AppsInfo getApps(@Context HttpServletRequest hsr,
      @QueryParam("state") String stateQuery,
      @QueryParam("states") Set<String> statesQuery,
      @QueryParam("finalStatus") String finalStatusQuery,
      @QueryParam("user") String userQuery,
      @QueryParam("queue") String queueQuery,
      @QueryParam("limit") String count,
      @QueryParam("startedTimeBegin") String startedBegin,
      @QueryParam("startedTimeEnd") String startedEnd,
      @QueryParam("finishedTimeBegin") String finishBegin,
      @QueryParam("finishedTimeEnd") String finishEnd,
      @QueryParam("applicationTypes") Set<String> applicationTypes,
      @QueryParam("applicationTags") Set<String> applicationTags) {

    init();
    GetApplicationsRequest request = buildApplicationsRequest(stateQuery, statesQuery,
        finalStatusQuery, userQuery, queueQuery, count, startedBegin, startedEnd,
        finishBegin, finishEnd, applicationTypes, applicationTags);
    List<ApplicationReport> reports = fetchApplicationReports(request);
    return filterAndBuildAppsInfo(reports, finalStatusQuery, hsr);
  }

  private GetApplicationsRequest buildApplicationsRequest(String stateQuery,
      Set<String> statesQuery, String finalStatusQuery, String userQuery,
      String queueQuery, String count, String startedBegin, String startedEnd,
      String finishBegin, String finishEnd, Set<String> appTypes,
      Set<String> appTags) {

    GetApplicationsRequest req = GetApplicationsRequest.newInstance();

    if (count != null && !count.isEmpty()) {
      long limit = parsePositiveLong(count, "limit");
      req.setLimit(limit);
    }

    if (startedBegin != null && !startedBegin.isEmpty()
        || startedEnd != null && !startedEnd.isEmpty()) {
      long sBegin = (startedBegin == null || startedBegin.isEmpty())
          ? 0 : parsePositiveLong(startedBegin, "startedTimeBegin");
      long sEnd = (startedEnd == null || startedEnd.isEmpty())
          ? Long.MAX_VALUE : parsePositiveLong(startedEnd, "startedTimeEnd");
      validateRange(sBegin, sEnd, "startedTimeBegin", "startedTimeEnd");
      req.setStartRange(sBegin, sEnd);
    }

    if (finishBegin != null && !finishBegin.isEmpty()
        || finishEnd != null && !finishEnd.isEmpty()) {
      long fBegin = (finishBegin == null || finishBegin.isEmpty())
          ? 0 : parsePositiveLong(finishBegin, "finishedTimeBegin");
      long fEnd = (finishEnd == null || finishEnd.isEmpty())
          ? Long.MAX_VALUE : parsePositiveLong(finishEnd, "finishedTimeEnd");
      validateRange(fBegin, fEnd, "finishedTimeBegin", "finishedTimeEnd");
      req.setFinishRange(fBegin, fEnd);
    }

    Set<String> types = parseQueries(appTypes, false);
    if (!types.isEmpty()) {
      req.setApplicationTypes(types);
    }

    Set<String> tags = parseQueries(appTags, false);
    if (!tags.isEmpty()) {
      req.setApplicationTags(tags);
    }

    if (stateQuery != null && !stateQuery.isEmpty()) {
      statesQuery.add(stateQuery);
    }
    Set<String> states = parseQueries(statesQuery, true);
    if (!states.isEmpty()) {
      req.setApplicationStates(states);
    }

    if (queueQuery != null && !queueQuery.isEmpty()) {
      validateQueueExists(queueQuery);
      req.setQueues(Collections.singleton(queueQuery));
    }

    if (userQuery != null && !userQuery.isEmpty()) {
      req.setUsers(Collections.singleton(userQuery));
    }

    return req;
  }

  private void validateQueueExists(String queue) {
    ResourceScheduler rs = rm.getResourceScheduler();
    if (rs instanceof CapacityScheduler) {
      try {
        ((CapacityScheduler) rs).getQueueInfo(queue, false, false);
      } catch (IOException e) {
        throw new BadRequestException(e.getMessage());
      }
    }
  }

  private List<ApplicationReport> fetchApplicationReports(GetApplicationsRequest request) {
    try {
      return rm.getClientRMService().getApplications(request, false)
          .getApplicationList();
    } catch (YarnException e) {
      LOG.error("Unable to retrieve apps from ClientRMService", e);
      throw new YarnRuntimeException(
          "Unable to retrieve apps from ClientRMService", e);
    }
  }

  private AppsInfo filterAndBuildAppsInfo(List<ApplicationReport> reports,
      String finalStatusQuery, HttpServletRequest hsr) {
    AppsInfo appsInfo = new AppsInfo();
    ConcurrentMap<ApplicationId, RMApp> apps = rm.getRMContext().getRMApps();
    for (ApplicationReport report : reports) {
      RMApp rmapp = apps.get(report.getApplicationId());
      if (rmapp == null) {
        continue;
      }
      if (finalStatusQuery != null && !finalStatusQuery.isEmpty()
          && !rmapp.getFinalApplicationStatus().toString()
              .equalsIgnoreCase(finalStatusQuery)) {
        continue;
      }
      appsInfo.add(new AppInfo(rm, rmapp, hasAccess(rmapp, hsr),
          WebAppUtils.getHttpSchemePrefix(conf)));
    }
    return appsInfo;
  }

  @GET
  @Path("/appstatistics")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public ApplicationStatisticsInfo getAppStatistics(
      @Context HttpServletRequest hsr,
      @QueryParam("states") Set<String> stateQueries,
      @QueryParam("applicationTypes") Set<String> typeQueries) {
    init();
    Set<String> states = parseQueries(stateQueries, true);
    Set<String> types = parseQueries(typeQueries, false);
    if (types.isEmpty()) {
      types.add(ANY);
    } else if (types.size() != 1) {
      throw new BadRequestException("# of applicationTypes = " + types.size()
          + ", we temporarily support at most one applicationType");
    }
    if (states.isEmpty()) {
      for (YarnApplicationState s : YarnApplicationState.values()) {
        states.add(StringUtils.toLowerCase(s.toString()));
      }
    }
    Map<YarnApplicationState, Map<String, Long>> scoreboard = buildScoreboard(states, types);
    for (RMApp rmapp : rm.getRMContext().getRMApps().values()) {
      YarnApplicationState state = rmapp.createApplicationState();
      String type = StringUtils.toLowerCase(rmapp.getApplicationType().trim());
      if (states.contains(StringUtils.toLowerCase(state.toString()))) {
        if (types.contains(ANY)) {
          countApp(scoreboard, state, ANY);
        } else if (types.contains(type)) {
          countApp(scoreboard, state, type);
        }
      }
    }
    ApplicationStatisticsInfo info = new ApplicationStatisticsInfo();
    for (Map.Entry<YarnApplicationState, Map<String, Long>> entry : scoreboard
        .entrySet()) {
      for (Map.Entry<String, Long> stat : entry.getValue().entrySet()) {
        info.add(new StatisticsItemInfo(entry.getKey(), stat.getKey(),
            stat.getValue()));
      }
    }
    return info;
  }

  private static Set<String> parseQueries(Set<String> queries, boolean isState) {
    Set<String> params = new HashSet<>();
    for (String query : queries) {
      if (query == null || query.trim().isEmpty()) {
        continue;
      }
      for (String part : query.split(",")) {
        if (part == null || part.trim().isEmpty()) {
          continue;
        }
        if (isState) {
          try {
            YarnApplicationState.valueOf(
                StringUtils.toUpperCase(part.trim()));
          } catch (RuntimeException e) {
            String all = Arrays.toString(YarnApplicationState.values());
            throw new BadRequestException(
                "Invalid application-state " + part.trim()
                    + " specified. It should be one of " + all);
          }
        }
        params.add(StringUtils.toLowerCase(part.trim()));
      }
    }
    return params;
  }

  private static Map<YarnApplicationState, Map<String, Long>> buildScoreboard(
      Set<String> states, Set<String> types) {
    Map<YarnApplicationState, Map<String, Long>> board = new HashMap<>();
    for (String s : states) {
      Map<String, Long> map = new HashMap<>();
      board.put(YarnApplicationState.valueOf(StringUtils.toUpperCase(s)), map);
      for (String t : types) {
        map.put(t, 0L);
      }
    }
    return board;
  }

  private static void countApp(
      Map<YarnApplicationState, Map<String, Long>> board,
      YarnApplicationState state, String type) {
    Map<String, Long> map = board.get(state);
    map.put(type, map.get(type) + 1);
  }

  @GET
  @Path("/apps/{appid}")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public AppInfo getApp(@Context HttpServletRequest hsr,
      @PathParam("appid") String appId) {
    init();
    ApplicationId id = ConverterUtils.toApplicationId(recordFactory, appId);
    if (id == null) {
      throw new NotFoundException("appId is null");
    }
    RMApp app = rm.getRMContext().getRMApps().get(id);
    if (app == null) {
      throw new NotFoundException("app with id: " + appId + " not found");
    }
    return new AppInfo(rm, app, hasAccess(app, hsr),
        hsr.getScheme() + "://");
  }

  @GET
  @Path("/apps/{appid}/appattempts")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public AppAttemptsInfo getAppAttempts(@PathParam("appid") String appId) {
    init();
    RMApp app = getRMAppForAppId(appId);
    AppAttemptsInfo info = new AppAttemptsInfo();
    for (RMAppAttempt attempt : app.getAppAttempts().values()) {
      info.add(new AppAttemptInfo(attempt, app.getUser()));
    }
    return info;
  }

  @GET
  @Path("/apps/{appid}/state")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public AppState getAppState(@Context HttpServletRequest hsr,
      @PathParam("appid") String appId) throws AuthorizationException {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    String user = (ugi != null) ? ugi.getUserName() : "";
    RMApp app = getRMAppForAppId(appId);
    AppState state = new AppState();
    state.setState(app.getState().toString());
    return state;
  }

  @PUT
  @Path("/apps/{appid}/state")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  @Consumes({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response updateAppState(AppState targetState,
      @Context HttpServletRequest hsr, @PathParam("appid") String appId)
      throws AuthorizationException, YarnException, InterruptedException,
      IOException {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    if (ugi == null) {
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(ugi)) {
      return Response.status(Status.FORBIDDEN)
          .entity("The default static user cannot carry out this operation.").build();
    }
    RMApp app = getRMAppForAppId(appId);
    if (!app.getState().toString().equals(targetState.getState())) {
      if (YarnApplicationState.KILLED.toString().equals(targetState.getState())) {
        return killApp(app, ugi, hsr);
      }
      throw new BadRequestException("Only '" + YarnApplicationState.KILLED
          + "' is allowed as a target state.");
    }
    AppState ret = new AppState();
    ret.setState(app.getState().toString());
    return Response.status(Status.OK).entity(ret).build();
  }

  @GET
  @Path("/get-node-to-labels")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public NodeToLabelsInfo getNodeToLabels(@Context HttpServletRequest hsr)
      throws IOException {
    init();
    NodeToLabelsInfo ntl = new NodeToLabelsInfo();
    Map<NodeId, Set<String>> map = rm.getRMContext().getNodeLabelManager()
        .getNodeLabels();
    for (Map.Entry<NodeId, Set<String>> e : map.entrySet()) {
      ntl.getNodeToLabels().put(e.getKey().toString(),
          new NodeLabelsInfo(e.getValue()));
    }
    return ntl;
  }

  @POST
  @Path("/replace-node-to-labels")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response replaceLabelsOnNodes(NodeToLabelsInfo newNodeToLabels,
      @Context HttpServletRequest hsr) throws IOException {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    authorizeNodeLabelOperation(ugi, "replace-node-to-labels");
    Map<NodeId, Set<String>> map = new HashMap<>();
    for (Map.Entry<String, NodeLabelsInfo> e : newNodeToLabels.getNodeToLabels()
        .entrySet()) {
      map.put(ConverterUtils.toNodeIdWithDefaultPort(e.getKey()),
          new HashSet<>(e.getValue().getNodeLabels()));
    }
    rm.getRMContext().getNodeLabelManager().replaceLabelsOnNode(map);
    return Response.status(Status.OK).build();
  }

  @GET
  @Path("/get-node-labels")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public NodeLabelsInfo getClusterNodeLabels(@Context HttpServletRequest hsr)
      throws IOException {
    init();
    return new NodeLabelsInfo(rm.getRMContext().getNodeLabelManager()
        .getClusterNodeLabels());
  }

  @POST
  @Path("/add-node-labels")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response addToClusterNodeLabels(NodeLabelsInfo newNodeLabels,
      @Context HttpServletRequest hsr) throws Exception {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    authorizeNodeLabelOperation(ugi, "add-node-labels");
    rm.getRMContext().getNodeLabelManager()
        .addToCluserNodeLabels(new HashSet<>(newNodeLabels.getNodeLabels()));
    return Response.status(Status.OK).build();
  }

  @POST
  @Path("/remove-node-labels")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response removeFromCluserNodeLabels(NodeLabelsInfo oldNodeLabels,
      @Context HttpServletRequest hsr) throws Exception {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    authorizeNodeLabelOperation(ugi, "remove-node-labels");
    rm.getRMContext().getNodeLabelManager()
        .removeFromClusterNodeLabels(new HashSet<>(oldNodeLabels.getNodeLabels()));
    return Response.status(Status.OK).build();
  }

  @GET
  @Path("/nodes/{nodeId}/get-labels")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public NodeLabelsInfo getLabelsOnNode(@Context HttpServletRequest hsr,
      @PathParam("nodeId") String nodeId) throws IOException {
    init();
    NodeId nid = ConverterUtils.toNodeIdWithDefaultPort(nodeId);
    return new NodeLabelsInfo(
        rm.getRMContext().getNodeLabelManager().getLabelsOnNode(nid));
  }

  @POST
  @Path("/nodes/{nodeId}/replace-labels")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response replaceLabelsOnNode(NodeLabelsInfo newNodeLabelsInfo,
      @Context HttpServletRequest hsr, @PathParam("nodeId") String nodeId)
      throws Exception {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    authorizeNodeLabelOperation(ugi, "replace-labels");
    NodeId nid = ConverterUtils.toNodeIdWithDefaultPort(nodeId);
    Map<NodeId, Set<String>> map = Collections.singletonMap(nid,
        new HashSet<>(newNodeLabelsInfo.getNodeLabels()));
    rm.getRMContext().getNodeLabelManager().replaceLabelsOnNode(map);
    return Response.status(Status.OK).build();
  }

  private void authorizeNodeLabelOperation(UserGroupInformation ugi,
      String operation) {
    if (ugi == null) {
      throw new AuthorizationException(
          "Unable to obtain user name, user not authenticated for " + operation);
    }
    if (!rm.getRMContext().getNodeLabelManager().checkAccess(ugi)) {
      throw new AuthorizationException("User " + ugi.getShortUserName()
          + " not authorized for " + operation);
    }
  }

  protected Response killApp(RMApp app, UserGroupInformation callerUGI,
      HttpServletRequest hsr) throws IOException, InterruptedException {
    if (app == null) {
      throw new IllegalArgumentException("app cannot be null");
    }
    String user = callerUGI.getUserName();
    final ApplicationId appId = app.getApplicationId();
    KillApplicationResponse resp = callerUGI.doAs(
        (PrivilegedExceptionAction<KillApplicationResponse>) () -> {
          KillApplicationRequest req = KillApplicationRequest.newInstance(appId);
          return rm.getClientRMService().forceKillApplication(req);
        });
    AppState state = new AppState();
    state.setState(app.getState().toString());
    if (resp.getIsKillCompleted()) {
      RMAuditLogger.logSuccess(user, AuditConstants.KILL_APP_REQUEST,
          "RMWebService", app.getApplicationId());
      return Response.status(Status.OK).entity(state).build();
    }
    return Response.status(Status.ACCEPTED).entity(state)
        .header(HttpHeaders.LOCATION, hsr.getRequestURL()).build();
  }

  @GET
  @Path("/apps/{appid}/queue")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public AppQueue getAppQueue(@Context HttpServletRequest hsr,
      @PathParam("appid") String appId) throws AuthorizationException {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    String user = (ugi != null) ? ugi.getUserName() : "UNKNOWN-USER";
    RMApp app = getRMAppForAppId(appId);
    AppQueue q = new AppQueue();
    q.setQueue(app.getQueue());
    return q;
  }

  @PUT
  @Path("/apps/{appid}/queue")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  @Consumes({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response updateAppQueue(AppQueue targetQueue,
      @Context HttpServletRequest hsr, @PathParam("appid") String appId)
      throws AuthorizationException, YarnException, InterruptedException,
      IOException {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    if (ugi == null) {
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(ugi)) {
      return Response.status(Status.FORBIDDEN)
          .entity("The default static user cannot carry out this operation.").build();
    }
    RMApp app = getRMAppForAppId(appId);
    if (!app.getQueue().equals(targetQueue.getQueue())) {
      return moveApp(app, ugi, targetQueue.getQueue());
    }
    AppQueue ret = new AppQueue();
    ret.setQueue(app.getQueue());
    return Response.status(Status.OK).entity(ret).build();
  }

  protected Response moveApp(RMApp app, UserGroupInformation callerUGI,
      String targetQueue) throws IOException, InterruptedException {
    if (app == null) {
      throw new IllegalArgumentException("app cannot be null");
    }
    final ApplicationId appId = app.getApplicationId();
    callerUGI.doAs((PrivilegedExceptionAction<Void>) () -> {
      MoveApplicationAcrossQueuesRequest req = MoveApplicationAcrossQueuesRequest
          .newInstance(appId, targetQueue);
      rm.getClientRMService().moveApplicationAcrossQueues(req);
      return null;
    });
    AppQueue ret = new AppQueue();
    ret.setQueue(app.getQueue());
    return Response.status(Status.OK).entity(ret).build();
  }

  private RMApp getRMAppForAppId(String appId) {
    if (appId == null || appId.isEmpty()) {
      throw new NotFoundException("appId, " + appId + ", is empty or null");
    }
    ApplicationId id;
    try {
      id = ConverterUtils.toApplicationId(recordFactory, appId);
    } catch (NumberFormatException e) {
      throw new NotFoundException("appId is invalid");
    }
    if (id == null) {
      throw new NotFoundException("appId is invalid");
    }
    RMApp app = rm.getRMContext().getRMApps().get(id);
    if (app == null) {
      throw new NotFoundException("app with id: " + appId + " not found");
    }
    return app;
  }

  private UserGroupInformation getCallerUserGroupInformation(
      HttpServletRequest hsr, boolean usePrincipal) {
    String remoteUser = hsr.getRemoteUser();
    if (usePrincipal) {
      Principal princ = hsr.getUserPrincipal();
      remoteUser = (princ == null) ? null : princ.getName();
    }
    return (remoteUser != null) ? UserGroupInformation.createRemoteUser(remoteUser) : null;
  }

  private boolean isStaticUser(UserGroupInformation callerUGI) {
    String staticUser = conf.get(CommonConfigurationKeys.HADOOP_HTTP_STATIC_USER,
        CommonConfigurationKeys.DEFAULT_HADOOP_HTTP_STATIC_USER);
    return staticUser.equals(callerUGI.getUserName());
  }

  @POST
  @Path("/apps/new-application")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response createNewApplication(@Context HttpServletRequest hsr)
      throws AuthorizationException, IOException, InterruptedException {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    if (ugi == null) {
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(ugi)) {
      return Response.status(Status.FORBIDDEN)
          .entity("The default static user cannot carry out this operation.").build();
    }
    return Response.status(Status.OK).entity(createNewApplication()).build();
  }

  @POST
  @Path("/apps")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  @Consumes({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response submitApplication(ApplicationSubmissionContextInfo newApp,
      @Context HttpServletRequest hsr) throws AuthorizationException,
      IOException, InterruptedException {
    init();
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    if (ugi == null) {
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (UserGroupInformation.isSecurityEnabled() && isStaticUser(ugi)) {
      return Response.status(Status.FORBIDDEN)
          .entity("The default static user cannot carry out this operation.").build();
    }
    ApplicationSubmissionContext ctx = createAppSubmissionContext(newApp);
    SubmitApplicationRequest req = SubmitApplicationRequest.newInstance(ctx);
    try {
      ugi.doAs((PrivilegedExceptionAction<SubmitApplicationResponse>) () ->
          rm.getClientRMService().submitApplication(req));
    } catch (UndeclaredThrowableException ue) {
      if (ue.getCause() instanceof YarnException) {
        throw new BadRequestException(ue.getCause().getMessage());
      }
      LOG.info("Submit app request failed", ue);
      throw ue;
    }
    String url = hsr.getRequestURL() + "/" + newApp.getApplicationId();
    return Response.status(Status.ACCEPTED).header(HttpHeaders.LOCATION, url).build();
  }

  private NewApplication createNewApplication() {
    GetNewApplicationRequest req = recordFactory
        .newRecordInstance(GetNewApplicationRequest.class);
    try {
      GetNewApplicationResponse resp = rm.getClientRMService().getNewApplication(req);
      return new NewApplication(resp.getApplicationId().toString(),
          new ResourceInfo(resp.getMaximumResourceCapability()));
    } catch (YarnException e) {
      String msg = "Unable to create new app from RM web service";
      LOG.error(msg, e);
      throw new YarnRuntimeException(msg, e);
    }
  }

  protected ApplicationSubmissionContext createAppSubmissionContext(
      ApplicationSubmissionContextInfo newApp) throws IOException {
    ApplicationId appId;
    try {
      appId = ConverterUtils.toApplicationId(recordFactory,
          newApp.getApplicationId());
    } catch (Exception e) {
      throw new BadRequestException(
          "Could not parse application id " + newApp.getApplicationId());
    }
    return ApplicationSubmissionContext.newInstance(appId,
        newApp.getApplicationName(), newApp.getQueue(),
        Priority.newInstance(newApp.getPriority()),
        createContainerLaunchContext(newApp), newApp.getUnmanagedAM(),
        newApp.getCancelTokensWhenComplete(), newApp.getMaxAppAttempts(),
        createAppSubmissionContextResource(newApp), newApp.getApplicationType(),
        newApp.getKeepContainersAcrossApplicationAttempts(),
        newApp.getAppNodeLabelExpression(),
        newApp.getAMContainerNodeLabelExpression())
        .setApplicationTags(newApp.getApplicationTags());
  }

  protected Resource createAppSubmissionContextResource(
      ApplicationSubmissionContextInfo newApp) {
    int maxVcores = rm.getConfig().getInt(
        YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES,
        YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_VCORES);
    int maxMemory = rm.getConfig().getInt(
        YarnConfiguration.RM_SCHEDULER_MAXIMUM_ALLOCATION_MB,
        YarnConfiguration.DEFAULT_RM_SCHEDULER_MAXIMUM_ALLOCATION_MB);
    if (newApp.getResource().getvCores() > maxVcores) {
      throw new BadRequestException("Requested more cores than configured max");
    }
    if (newApp.getResource().getMemory() > maxMemory) {
      throw new BadRequestException("Requested more memory than configured max");
    }
    return Resource.newInstance(newApp.getResource().getMemory(),
        newApp.getResource().getvCores());
  }

  protected ContainerLaunchContext createContainerLaunchContext(
      ApplicationSubmissionContextInfo newApp) throws IOException {
    HashMap<String, ByteBuffer> serviceData = new HashMap<>();
    for (Map.Entry<String, String> e : newApp.getContainerLaunchContextInfo()
        .getAuxillaryServiceData().entrySet()) {
      if (!e.getValue().isEmpty()) {
        byte[] data = new Base64(0, null, true).decode(e.getValue());
        serviceData.put(e.getKey(), ByteBuffer.wrap(data));
      }
    }
    HashMap<String, LocalResource> resources = new HashMap<>();
    for (Map.Entry<String, LocalResourceInfo> e : newApp
        .getContainerLaunchContextInfo().getResources().entrySet()) {
      LocalResourceInfo l = e.getValue();
      resources.put(e.getKey(),
          LocalResource.newInstance(ConverterUtils.getYarnUrlFromURI(l.getUrl()),
              l.getType(), l.getVisibility(), l.getSize(), l.getTimestamp()));
    }
    DataOutputBuffer out = new DataOutputBuffer();
    Credentials cs = createCredentials(newApp.getContainerLaunchContextInfo()
        .getCredentials());
    cs.writeTokenStorageToStream(out);
    ByteBuffer tokens = ByteBuffer.wrap(out.getData());
    return ContainerLaunchContext.newInstance(resources,
        newApp.getContainerLaunchContextInfo().getEnvironment(),
        newApp.getContainerLaunchContextInfo().getCommands(),
        serviceData, tokens,
        newApp.getContainerLaunchContextInfo().getAcls());
  }

  private Credentials createCredentials(CredentialsInfo credentials) {
    Credentials cs = new Credentials();
    try {
      for (Map.Entry<String, String> e : credentials.getTokens().entrySet()) {
        Token<TokenIdentifier> token = new Token<>();
        token.decodeFromUrlString(e.getValue());
        cs.addToken(new Text(e.getKey()), token);
      }
      for (Map.Entry<String, String> e : credentials.getSecrets().entrySet()) {
        byte[] secret = new Base64(0, null, true).decode(e.getValue());
        cs.addSecretKey(new Text(e.getKey()), secret);
      }
    } catch (IOException ie) {
      throw new BadRequestException(
          "Could not parse credentials data; exception message = "
              + ie.getMessage());
    }
    return cs;
  }

  private UserGroupInformation createKerberosUserGroupInformation(
      HttpServletRequest hsr) throws AuthorizationException, YarnException {
    UserGroupInformation ugi = getCallerUserGroupInformation(hsr, true);
    if (ugi == null) {
      throw new AuthorizationException("Unable to obtain user name, user not authenticated");
    }
    if (!KerberosAuthenticationHandler.TYPE.equalsIgnoreCase(hsr.getAuthType())) {
      throw new YarnException("Delegation token operations can only be carried out on a Kerberos authenticated channel. Expected auth type is "
          + KerberosAuthenticationHandler.TYPE + ", got type " + hsr.getAuthType());
    }
    if (hsr.getAttribute(DelegationTokenAuthenticationHandler.DELEGATION_TOKEN_UGI_ATTRIBUTE) != null) {
      throw new YarnException("Delegation token operations cannot be carried out using delegation token authentication.");
    }
    ugi.setAuthenticationMethod(AuthenticationMethod.KERBEROS);
    return ugi;
  }

  @POST
  @Path("/delegation-token")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  @Consumes({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response postDelegationToken(DelegationToken tokenData,
      @Context HttpServletRequest hsr) throws AuthorizationException,
      IOException, InterruptedException, Exception {
    init();
    UserGroupInformation ugi;
    try {
      ugi = createKerberosUserGroupInformation(hsr);
    } catch (YarnException ye) {
      return Response.status(Status.FORBIDDEN).entity(ye.getMessage()).build();
    }
    return createDelegationToken(tokenData, hsr, ugi);
  }

  @POST
  @Path("/delegation-token/expiration")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  @Consumes({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response postDelegationTokenExpiration(@Context HttpServletRequest hsr)
      throws AuthorizationException, IOException, InterruptedException,
      Exception {
    init();
    UserGroupInformation ugi;
    try {
      ugi = createKerberosUserGroupInformation(hsr);
    } catch (YarnException ye) {
      return Response.status(Status.FORBIDDEN).entity(ye.getMessage()).build();
    }
    DelegationToken req = new DelegationToken();
    req.setToken(extractToken(hsr).encodeToUrlString());
    return renewDelegationToken(req, hsr, ugi);
  }

  private Response createDelegationToken(DelegationToken tokenData,
      HttpServletRequest hsr, UserGroupInformation ugi)
      throws Exception {
    GetDelegationTokenResponse resp = ugi.doAs(
        (PrivilegedExceptionAction<GetDelegationTokenResponse>) () -> {
          GetDelegationTokenRequest createReq = GetDelegationTokenRequest
              .newInstance(tokenData.getRenewer());
          return rm.getClientRMService().getDelegationToken(createReq);
        });
    Token<RMDelegationTokenIdentifier> tk = new Token<>(
        resp.getRMDelegationToken().getIdentifier().array(),
        resp.getRMDelegationToken().getPassword().array(),
        new Text(resp.getRMDelegationToken().getKind()),
        new Text(resp.getRMDelegationToken().getService()));
    RMDelegationTokenIdentifier id = tk.decodeIdentifier();
    long exp = rm.getRMContext().getRMDelegationTokenSecretManager()
        .getRenewDate(id);
    DelegationToken out = new DelegationToken(tk.encodeToUrlString(),
        tokenData.getRenewer(), id.getOwner().toString(),
        tk.getKind().toString(), exp, id.getMaxDate());
    return Response.status(Status.OK).entity(out).build();
  }

  private Response renewDelegationToken(DelegationToken tokenData,
      HttpServletRequest hsr, UserGroupInformation ugi)
      throws Exception {
    Token<RMDelegationTokenIdentifier> token = extractToken(tokenData.getToken());
    org.apache.hadoop.yarn.api.records.Token dToken = BuilderUtils
        .newDelegationToken(token.getIdentifier(), token.getKind().toString(),
            token.getPassword(), token.getService().toString());
    RenewDelegationTokenResponse resp = ugi.doAs(
        (PrivilegedExceptionAction<RenewDelegationTokenResponse>) () -> {
          RenewDelegationTokenRequest req = RenewDelegationTokenRequest
              .newInstance(dToken);
          return rm.getClientRMService().renewDelegationToken(req);
        });
    DelegationToken out = new DelegationToken();
    out.setNextExpirationTime(resp.getNextExpirationTime());
    return Response.status(Status.OK).entity(out).build();
  }

  @DELETE
  @Path("/delegation-token")
  @Produces({MediaType.APPLICATION_JSON, MediaType.APPLICATION_XML})
  public Response cancelDelegationToken(@Context HttpServletRequest hsr)
      throws Exception {
    init();
    UserGroupInformation ugi;
    try {
      ugi = createKerberosUserGroupInformation(hsr);
    } catch (YarnException ye) {
      return Response.status(Status.FORBIDDEN).entity(ye.getMessage()).build();
    }
    Token<RMDelegationTokenIdentifier> token = extractToken(hsr);
    org.apache.hadoop.yarn.api.records.Token dToken = BuilderUtils
        .newDelegationToken(token.getIdentifier(), token.getKind().toString(),
            token.getPassword(), token.getService().toString());
    CancelDelegationTokenRequest req = CancelDelegationTokenRequest
        .newInstance(dToken);
    ugi.doAs((PrivilegedExceptionAction<CancelDelegationTokenResponse>) () -> {
      rm.getClientRMService().cancelDelegationToken(req);
      return null;
    });
    return Response.status(Status.OK).build();
  }

  private Token<RMDelegationTokenIdentifier> extractToken(
      HttpServletRequest request) {
    String encoded = request.getHeader(DELEGATION_TOKEN_HEADER);
    if (encoded == null) {
      throw new BadRequestException(
          "Header '" + DELEGATION_TOKEN_HEADER + "' containing encoded token not found");
    }
    return extractToken(encoded);
  }

  private Token<RMDelegationTokenIdentifier> extractToken(String encodedToken) {
    Token<RMDelegationTokenIdentifier> token = new Token<>();
    try {
      token.decodeFromUrlString(encodedToken);
    } catch (Exception e) {
      throw new BadRequestException("Could not decode encoded token");
    }
    return token;
  }

  private long parsePositiveLong(String value, String paramName) {
    long v = Long.parseLong(value);
    if (v <= 0) {
      throw new BadRequestException(paramName + " value must be greater than 0");
    }
    return v;
  }

  private void validateRange(long begin, long end, String beginName,
      String endName) {
    if (begin > end) {
      throw new BadRequestException(endName + " must be greater than " + beginName);
    }
  }
}
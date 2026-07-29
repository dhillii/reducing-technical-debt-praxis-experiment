package org.apache.hadoop.yarn.server.resourcemanager.scheduler.capacity;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.apache.commons.lang.StringUtils;
import org.apache.commons.lang.mutable.MutableObject;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience.Private;
import org.apache.hadoop.classification.InterfaceStability.Unstable;
import org.apache.hadoop.security.AccessControlException;
import org.apache.hadoop.security.UserGroupInformation;
import org.apache.hadoop.security.authorize.AccessControlList;
import org.apache.hadoop.yarn.api.records.ApplicationAttemptId;
import org.apache.hadoop.yarn.api.records.ApplicationId;
import org.apache.hadoop.yarn.api.records.Container;
import org.apache.hadoop.yarn.api.records.ContainerId;
import org.apache.hadoop.yarn.api.records.ContainerStatus;
import org.apache.hadoop.yarn.api.records.NodeId;
import org.apache.hadoop.yarn.api.records.Priority;
import org.apache.hadoop.yarn.api.records.QueueACL;
import org.apache.hadoop.yarn.api.records.QueueInfo;
import org.apache.hadoop.yarn.api.records.QueueState;
import org.apache.hadoop.yarn.api.records.QueueUserACLInfo;
import org.apache.hadoop.yarn.api.records.Resource;
import org.apache.hadoop.yarn.api.records.ResourceRequest;
import org.apache.hadoop.yarn.factories.RecordFactory;
import org.apache.hadoop.yarn.factory.providers.RecordFactoryProvider;
import org.apache.hadoop.yarn.nodelabels.CommonNodeLabelsManager;
import org.apache.hadoop.yarn.security.AccessType;
import org.apache.hadoop.yarn.server.resourcemanager.RMContext;
import org.apache.hadoop.yarn.server.resourcemanager.nodelabels.RMNodeLabelsManager;
import org.apache.hadoop.yarn.server.resourcemanager.rmcontainer.RMContainer;
import org.apache.hadoop.yarn.server.resourcemanager.rmcontainer.RMContainerEventType;
import org.apache.hadoop.yarn.server.resourcemanager.rmcontainer.RMContainerState;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.ActiveUsersManager;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.NodeType;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.ResourceLimits;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.ResourceUsage;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerAppUtils;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerApplicationAttempt;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.SchedulerUtils;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.common.fica.FiCaSchedulerApp;
import org.apache.hadoop.yarn.server.resourcemanager.scheduler.common.fica.FiCaSchedulerNode;
import org.apache.hadoop.yarn.server.utils.BuilderUtils;
import org.apache.hadoop.yarn.server.utils.Lock;
import org.apache.hadoop.yarn.server.utils.Lock.NoLock;
import org.apache.hadoop.yarn.util.resource.Resources;

import com.google.common.annotations.VisibleForTesting;

@Private
@Unstable
public class LeafQueue extends AbstractCSQueue {
  private static final Log LOG = LogFactory.getLog(LeafQueue.class);

  private float absoluteUsedCapacity = 0.0f;
  private int userLimit;
  private float userLimitFactor;

  protected int maxApplications;
  protected int maxApplicationsPerUser;
  
  private float maxAMResourcePerQueuePercent;
  
  private int nodeLocalityDelay;

  Set<FiCaSchedulerApp> activeApplications;
  Map<ApplicationAttemptId, FiCaSchedulerApp> applicationAttemptMap = 
      new HashMap<ApplicationAttemptId, FiCaSchedulerApp>();
  
  Set<FiCaSchedulerApp> pendingApplications;
  
  private float minimumAllocationFactor;

  private Map<String, User> users = new HashMap<String, User>();

  private final RecordFactory recordFactory = 
    RecordFactoryProvider.getRecordFactory(null);

  private CapacitySchedulerContext scheduler;
  
  private final ActiveUsersManager activeUsersManager;

  private Resource lastClusterResource = Resources.none();
  
  private Resource absoluteCapacityResource = Resources.none();
  
  private final QueueResourceLimitsInfo queueResourceLimitsInfo =
      new QueueResourceLimitsInfo();
  
  private volatile ResourceLimits cachedResourceLimitsForHeadroom = null;
  
  public LeafQueue(CapacitySchedulerContext cs, 
      String queueName, CSQueue parent, CSQueue old) throws IOException {
    super(cs, queueName, parent, old);
    this.scheduler = cs;

    this.activeUsersManager = new ActiveUsersManager(metrics); 

    if(LOG.isDebugEnabled()) {
      LOG.debug("LeafQueue:" + " name=" + queueName
        + ", fullname=" + getQueuePath());
    }

    Comparator<FiCaSchedulerApp> applicationComparator =
        cs.getApplicationComparator();
    this.pendingApplications = 
        new TreeSet<FiCaSchedulerApp>(applicationComparator);
    this.activeApplications = new TreeSet<FiCaSchedulerApp>(applicationComparator);
    
    setupQueueConfigs(cs.getClusterResource());
  }

  protected synchronized void setupQueueConfigs(Resource clusterResource)
      throws IOException {
    super.setupQueueConfigs(clusterResource);
    
    this.lastClusterResource = clusterResource;
    updateAbsoluteCapacityResource(clusterResource);
    
    this.cachedResourceLimitsForHeadroom = new ResourceLimits(clusterResource);
    
    setQueueResourceLimitsInfo(clusterResource);

    CapacitySchedulerConfiguration conf = csContext.getConfiguration();
    userLimit = conf.getUserLimit(getQueuePath());
    userLimitFactor = conf.getUserLimitFactor(getQueuePath());

    maxApplications = conf.getMaximumApplicationsPerQueue(getQueuePath());
    if (maxApplications < 0) {
      int maxSystemApps = conf.getMaximumSystemApplications();
      maxApplications =
          (int) (maxSystemApps * queueCapacities.getAbsoluteCapacity());
    }
    maxApplicationsPerUser = 
      (int)(maxApplications * (userLimit / 100.0f) * userLimitFactor);
    
    maxAMResourcePerQueuePercent =
        conf.getMaximumApplicationMasterResourcePerQueuePercent(getQueuePath());

    validateLabelExpression();
    
    nodeLocalityDelay = conf.getNodeLocalityDelay();

    this.minimumAllocationFactor =
        Resources.ratio(resourceCalculator,
            Resources.subtract(maximumAllocation, minimumAllocation),
            maximumAllocation);

    logQueueConfiguration();
  }

  private void validateLabelExpression() throws IOException {
    if (!SchedulerUtils.checkQueueLabelExpression(
        this.accessibleLabels, this.defaultLabelExpression, null)) {
      throw new IOException("Invalid default label expression of "
          + " queue="
          + getQueueName()
          + " doesn't have permission to access all labels "
          + "in default label expression. labelExpression of resource request="
          + (this.defaultLabelExpression == null ? ""
              : this.defaultLabelExpression)
          + ". Queue labels="
          + (getAccessibleNodeLabels() == null ? "" : StringUtils.join(
              getAccessibleNodeLabels().iterator(), ',')));
    }
  }

  private void logQueueConfiguration() {
    StringBuilder aclsString = new StringBuilder();
    for (Map.Entry<AccessType, AccessControlList> e : acls.entrySet()) {
      aclsString.append(e.getKey() + ":" + e.getValue().getAclString());
    }

    StringBuilder labelStrBuilder = new StringBuilder(); 
    if (accessibleLabels != null) {
      for (String s : accessibleLabels) {
        labelStrBuilder.append(s);
        labelStrBuilder.append(",");
      }
    }

    LOG.info("Initializing " + queueName + "\n" +
        "capacity = " + queueCapacities.getCapacity() +
        " [= (float) configuredCapacity / 100 ]" + "\n" + 
        "asboluteCapacity = " + queueCapacities.getAbsoluteCapacity() +
        " [= parentAbsoluteCapacity * capacity ]" + "\n" +
        "maxCapacity = " + queueCapacities.getMaximumCapacity() +
        " [= configuredMaxCapacity ]" + "\n" +
        "absoluteMaxCapacity = " + queueCapacities.getAbsoluteMaximumCapacity() +
        " [= 1.0 maximumCapacity undefined, " +
        "(parentAbsoluteMaxCapacity * maximumCapacity) / 100 otherwise ]" + 
        "\n" +
        "userLimit = " + userLimit +
        " [= configuredUserLimit ]" + "\n" +
        "userLimitFactor = " + userLimitFactor +
        " [= configuredUserLimitFactor ]" + "\n" +
        "maxApplications = " + maxApplications +
        " [= configuredMaximumSystemApplicationsPerQueue or" + 
        " (int)(configuredMaximumSystemApplications * absoluteCapacity)]" + 
        "\n" +
        "maxApplicationsPerUser = " + maxApplicationsPerUser +
        " [= (int)(maxApplications * (userLimit / 100.0f) * " +
        "userLimitFactor) ]" + "\n" +
        "usedCapacity = " + queueCapacities.getUsedCapacity() +
        " [= usedResourcesMemory / " +
        "(clusterResourceMemory * absoluteCapacity)]" + "\n" +
        "absoluteUsedCapacity = " + absoluteUsedCapacity +
        " [= usedResourcesMemory / clusterResourceMemory]" + "\n" +
        "maxAMResourcePerQueuePercent = " + maxAMResourcePerQueuePercent +
        " [= configuredMaximumAMResourcePercent ]" + "\n" +
        "minimumAllocationFactor = " + minimumAllocationFactor +
        " [= (float)(maximumAllocationMemory - minimumAllocationMemory) / " +
        "maximumAllocationMemory ]" + "\n" +
        "maximumAllocation = " + maximumAllocation +
        " [= configuredMaxAllocation ]" + "\n" +
        "numContainers = " + numContainers +
        " [= currentNumContainers ]" + "\n" +
        "state = " + state +
        " [= configuredState ]" + "\n" +
        "acls = " + aclsString +
        " [= configuredAcls ]" + "\n" + 
        "nodeLocalityDelay = " + nodeLocalityDelay + "\n" +
        "labels=" + labelStrBuilder.toString() + "\n" +
        "nodeLocalityDelay = " +  nodeLocalityDelay + "\n" +
        "reservationsContinueLooking = " +
        reservationsContinueLooking + "\n" +
        "preemptionDisabled = " + getPreemptionDisabled() + "\n");
  }

  @Override
  public String getQueuePath() {
    return getParent().getQueuePath() + "." + getQueueName();
  }

  @Private
  public float getMinimumAllocationFactor() {
    return minimumAllocationFactor;
  }
  
  @Private
  public float getMaxAMResourcePerQueuePercent() {
    return maxAMResourcePerQueuePercent;
  }

  public int getMaxApplications() {
    return maxApplications;
  }

  public synchronized int getMaxApplicationsPerUser() {
    return maxApplicationsPerUser;
  }

  @Override
  public ActiveUsersManager getActiveUsersManager() {
    return activeUsersManager;
  }

  @Override
  public List<CSQueue> getChildQueues() {
    return null;
  }
  
  synchronized void setUserLimit(int userLimit) {
    this.userLimit = userLimit;
  }

  synchronized void setUserLimitFactor(float userLimitFactor) {
    this.userLimitFactor = userLimitFactor;
  }

  @Override
  public synchronized int getNumApplications() {
    return getNumPendingApplications() + getNumActiveApplications();
  }

  public synchronized int getNumPendingApplications() {
    return pendingApplications.size();
  }

  public synchronized int getNumActiveApplications() {
    return activeApplications.size();
  }

  @Private
  public synchronized int getNumApplications(String user) {
    return getUser(user).getTotalApplications();
  }

  @Private
  public synchronized int getNumPendingApplications(String user) {
    return getUser(user).getPendingApplications();
  }

  @Private
  public synchronized int getNumActiveApplications(String user) {
    return getUser(user).getActiveApplications();
  }
  
  public synchronized int getNumContainers() {
    return numContainers;
  }

  @Override
  public synchronized QueueState getState() {
    return state;
  }

  @Private
  public synchronized int getUserLimit() {
    return userLimit;
  }

  @Private
  public synchronized float getUserLimitFactor() {
    return userLimitFactor;
  }

  @Override
  public synchronized QueueInfo getQueueInfo(
      boolean includeChildQueues, boolean recursive) {
    QueueInfo queueInfo = getQueueInfo();
    return queueInfo;
  }

  @Override
  public synchronized List<QueueUserACLInfo> 
  getQueueUserAclInfo(UserGroupInformation user) {
    QueueUserACLInfo userAclInfo = 
      recordFactory.newRecordInstance(QueueUserACLInfo.class);
    List<QueueACL> operations = new ArrayList<QueueACL>();
    for (QueueACL operation : QueueACL.values()) {
      if (hasAccess(operation, user)) {
        operations.add(operation);
      }
    }

    userAclInfo.setQueueName(getQueueName());
    userAclInfo.setUserAcls(operations);
    return Collections.singletonList(userAclInfo);
  }

  @Private
  public int getNodeLocalityDelay() {
    return nodeLocalityDelay;
  }
  
  public String toString() {
    return queueName + ": " + 
        "capacity=" + queueCapacities.getCapacity() + ", " + 
        "absoluteCapacity=" + queueCapacities.getAbsoluteCapacity() + ", " + 
        "usedResources=" + queueUsage.getUsed() +  ", " +
        "usedCapacity=" + getUsedCapacity() + ", " + 
        "absoluteUsedCapacity=" + getAbsoluteUsedCapacity() + ", " +
        "numApps=" + getNumApplications() + ", " + 
        "numContainers=" + getNumContainers();  
  }
  
  @VisibleForTesting
  public synchronized void setNodeLabelManager(RMNodeLabelsManager mgr) {
    this.labelManager = mgr;
  }

  @VisibleForTesting
  public synchronized User getUser(String userName) {
    User user = users.get(userName);
    if (user == null) {
      user = new User();
      users.put(userName, user);
    }
    return user;
  }

  public synchronized ArrayList<UserInfo> getUsers() {
    ArrayList<UserInfo> usersToReturn = new ArrayList<UserInfo>();
    for (Map.Entry<String, User> entry : users.entrySet()) {
      User user = entry.getValue();
      usersToReturn.add(new UserInfo(entry.getKey(), Resources.clone(user
          .getUsed()), user.getActiveApplications(), user
          .getPendingApplications(), Resources.clone(user
          .getConsumedAMResources()), Resources.clone(user
          .getUserResourceLimit())));
    }
    return usersToReturn;
  }

  @Override
  public synchronized void reinitialize(
      CSQueue newlyParsedQueue, Resource clusterResource) 
  throws IOException {
    if (!(newlyParsedQueue instanceof LeafQueue) || 
        !newlyParsedQueue.getQueuePath().equals(getQueuePath())) {
      throw new IOException("Trying to reinitialize " + getQueuePath() + 
          " from " + newlyParsedQueue.getQueuePath());
    }

    LeafQueue newlyParsedLeafQueue = (LeafQueue)newlyParsedQueue;

    validateMaximumAllocationChange(newlyParsedLeafQueue);

    setupQueueConfigs(clusterResource);

    activateApplications();
  }

  private void validateMaximumAllocationChange(LeafQueue newlyParsedLeafQueue) throws IOException {
    Resource oldMax = getMaximumAllocation();
    Resource newMax = newlyParsedLeafQueue.getMaximumAllocation();
    if (newMax.getMemory() < oldMax.getMemory()
        || newMax.getVirtualCores() < oldMax.getVirtualCores()) {
      throw new IOException(
          "Trying to reinitialize "
              + getQueuePath()
              + " the maximum allocation size can not be decreased!"
              + " Current setting: " + oldMax
              + ", trying to set it to: " + newMax);
    }
  }

  @Override
  public void submitApplicationAttempt(FiCaSchedulerApp application,
      String userName) {
    synchronized (this) {
      User user = getUser(userName);
      addApplicationAttempt(application, user);
    }

    if (application.isPending()) {
      metrics.submitAppAttempt(userName);
    }
    getParent().submitApplicationAttempt(application, userName);
  }

  @Override
  public void submitApplication(ApplicationId applicationId, String userName,
      String queue)  throws AccessControlException {
    UserGroupInformation userUgi = UserGroupInformation.createRemoteUser(userName);
    if (!hasAccess(QueueACL.SUBMIT_APPLICATIONS, userUgi)
        && !hasAccess(QueueACL.ADMINISTER_QUEUE, userUgi)) {
      throw new AccessControlException("User " + userName + " cannot submit" +
          " applications to queue " + getQueuePath());
    }

    User user = null;
    synchronized (this) {
      validateQueueState();
      validateQueueApplicationLimit(applicationId);
      user = getUser(userName);
      validateUserApplicationLimit(user, applicationId, userName);
    }

    try {
      getParent().submitApplication(applicationId, userName, queue);
    } catch (AccessControlException ace) {
      LOG.info("Failed to submit application to parent-queue: " + 
          getParent().getQueuePath(), ace);
      throw ace;
    }
  }

  private void validateQueueState() throws AccessControlException {
    if (getState() != QueueState.RUNNING) {
      String msg = "Queue " + getQueuePath() +
          " is STOPPED. Cannot accept submission of application";
      LOG.info(msg);
      throw new AccessControlException(msg);
    }
  }

  private void validateQueueApplicationLimit(ApplicationId applicationId) throws AccessControlException {
    if (getNumApplications() >= getMaxApplications()) {
      String msg = "Queue " + getQueuePath() + 
          " already has " + getNumApplications() + " applications," +
          " cannot accept submission of application: " + applicationId;
      LOG.info(msg);
      throw new AccessControlException(msg);
    }
  }

  private void validateUserApplicationLimit(User user, ApplicationId applicationId, String userName) throws AccessControlException {
    if (user.getTotalApplications() >= getMaxApplicationsPerUser()) {
      String msg = "Queue " + getQueuePath() + 
          " already has " + user.getTotalApplications() + 
          " applications from user " + userName + 
          " cannot accept submission of application: " + applicationId;
      LOG.info(msg);
      throw new AccessControlException(msg);
    }
  }
  
  public synchronized Resource getAMResourceLimit() {
    Resource queueCurrentLimit;
    synchronized (queueResourceLimitsInfo) {
      queueCurrentLimit = queueResourceLimitsInfo.getQueueCurrentLimit();
    }
    Resource queueCap = Resources.max(resourceCalculator, lastClusterResource,
        absoluteCapacityResource, queueCurrentLimit);
    return Resources.multiplyAndNormalizeUp( 
        resourceCalculator,
        queueCap, 
        maxAMResourcePerQueuePercent, minimumAllocation);
  }
  
  public synchronized Resource getUserAMResourceLimit() {
    float effectiveUserLimit = Math.max(userLimit / 100.0f, 1.0f /    
        Math.max(getActiveUsersManager().getNumActiveUsers(), 1));
    
    return Resources.multiplyAndNormalizeUp( 
        resourceCalculator,
        absoluteCapacityResource, 
        maxAMResourcePerQueuePercent * effectiveUserLimit  *
            userLimitFactor, minimumAllocation);
  }

  private synchronized void activateApplications() {
    Resource amLimit = getAMResourceLimit();
    Resource userAMLimit = getUserAMResourceLimit();
        
    for (Iterator<FiCaSchedulerApp> i=pendingApplications.iterator(); 
         i.hasNext(); ) {
      FiCaSchedulerApp application = i.next();
      
      if (!canActivateApplication(application, amLimit, userAMLimit)) {
        continue;
      }
      
      User user = getUser(application.getUser());
      user.activateApplication();
      activeApplications.add(application);
      queueUsage.incAMUsed(application.getAMResource());
      user.getResourceUsage().incAMUsed(application.getAMResource());
      i.remove();
      LOG.info("Application " + application.getApplicationId() +
          " from user: " + application.getUser() + 
          " activated in queue: " + getQueueName());
    }
  }

  private boolean canActivateApplication(FiCaSchedulerApp application, 
      Resource amLimit, Resource userAMLimit) {
    if (!canActivateApplicationAMLimit(application, amLimit)) {
      return false;
    }
    
    User user = getUser(application.getUser());
    if (!canActivateApplicationUserAMLimit(application, user, userAMLimit)) {
      return false;
    }
    
    return true;
  }

  private boolean canActivateApplicationAMLimit(FiCaSchedulerApp application, Resource amLimit) {
    Resource amIfStarted = 
        Resources.add(application.getAMResource(), queueUsage.getAMUsed());
    
    if (LOG.isDebugEnabled()) {
      LOG.debug("application AMResource " + application.getAMResource() +
          " maxAMResourcePerQueuePercent " + maxAMResourcePerQueuePercent +
          " amLimit " + amLimit +
          " lastClusterResource " + lastClusterResource +
          " amIfStarted " + amIfStarted);
    }
    
    if (!Resources.lessThanOrEqual(
        resourceCalculator, lastClusterResource, amIfStarted, amLimit)) {
      if (getNumActiveApplications() < 1) {
        LOG.warn("maximum-am-resource-percent is insufficient to start a" +
            " single application in queue, it is likely set too low." +
            " skipping enforcement to allow at least one application to start"); 
        return true;
      } else {
        LOG.info("not starting application as amIfStarted exceeds amLimit");
        return false;
      }
    }
    return true;
  }

  private boolean canActivateApplicationUserAMLimit(FiCaSchedulerApp application, 
      User user, Resource userAMLimit) {
    Resource userAmIfStarted = 
        Resources.add(application.getAMResource(),
            user.getConsumedAMResources());
    
    if (!Resources.lessThanOrEqual(
        resourceCalculator, lastClusterResource, userAmIfStarted, 
        userAMLimit)) {
      if (getNumActiveApplications() < 1) {
        LOG.warn("maximum-am-resource-percent is insufficient to start a" +
            " single application in queue for user, it is likely set too low." +
            " skipping enforcement to allow at least one application to start"); 
        return true;
      } else {
        LOG.info("not starting application as amIfStarted exceeds " +
            "userAmLimit");
        return false;
      }
    }
    return true;
  }
  
  private synchronized void addApplicationAttempt(FiCaSchedulerApp application,
      User user) {
    user.submitApplication();
    pendingApplications.add(application);
    applicationAttemptMap.put(application.getApplicationAttemptId(), application);

    activateApplications();
    
    LOG.info("Application added -" +
        " appId: " + application.getApplicationId() +
        " user: " + user + "," + " leaf-queue: " + getQueueName() +
        " #user-pending-applications: " + user.getPendingApplications() +
        " #user-active-applications: " + user.getActiveApplications() +
        " #queue-pending-applications: " + getNumPendingApplications() +
        " #queue-active-applications: " + getNumActiveApplications()
        );
  }

  @Override
  public void finishApplication(ApplicationId application, String user) {
    activeUsersManager.deactivateApplication(user, application);
    getParent().finishApplication(application, user);
  }

  @Override
  public void finishApplicationAttempt(FiCaSchedulerApp application, String queue) {
    synchronized (this) {
      removeApplicationAttempt(application, getUser(application.getUser()));
    }
    getParent().finishApplicationAttempt(application, queue);
  }

  public synchronized void removeApplicationAttempt(
      FiCaSchedulerApp application, User user) {
    boolean wasActive = activeApplications.remove(application);
    if (!wasActive) {
      pendingApplications.remove(application);
    } else {
      queueUsage.decAMUsed(application.getAMResource());
      user.getResourceUsage().decAMUsed(application.getAMResource());
    }
    applicationAttemptMap.remove(application.getApplicationAttemptId());

    user.finishApplication(wasActive);
    if (user.getTotalApplications() == 0) {
      users.remove(application.getUser());
    }

    activateApplications();

    LOG.info("Application removed -" +
        " appId: " + application.getApplicationId() + 
        " user: " + application.getUser() + 
        " queue: " + getQueueName() +
        " #user-pending-applications: " + user.getPendingApplications() +
        " #user-active-applications: " + user.getActiveApplications() +
        " #queue-pending-applications: " + getNumPendingApplications() +
        " #queue-active-applications: " + getNumActiveApplications()
        );
  }

  private synchronized FiCaSchedulerApp getApplication(
      ApplicationAttemptId applicationAttemptId) {
    return applicationAttemptMap.get(applicationAttemptId);
  }

  private static final CSAssignment NULL_ASSIGNMENT =
      new CSAssignment(Resources.createResource(0, 0), NodeType.NODE_LOCAL);
  
  private static final CSAssignment SKIP_ASSIGNMENT = new CSAssignment(true);
  
  private static Set<String> getRequestLabelSetByExpression(
      String labelExpression) {
    Set<String> labels = new HashSet<String>();
    if (null == labelExpression) {
      return labels;
    }
    for (String l : labelExpression.split("&&")) {
      if (l.trim().isEmpty()) {
        continue;
      }
      labels.add(l.trim());
    }
    return labels;
  }
  
  @Override
  public synchronized CSAssignment assignContainers(Resource clusterResource,
      FiCaSchedulerNode node, ResourceLimits currentResourceLimits) {
    updateCurrentResourceLimits(currentResourceLimits, clusterResource);
    
    if(LOG.isDebugEnabled()) {
      LOG.debug("assignContainers: node=" + node.getNodeName()
        + " #applications=" + activeApplications.size());
    }
    
    if (!SchedulerUtils.checkQueueAccessToNode(accessibleLabels,
        node.getLabels())) {
      return NULL_ASSIGNMENT;
    }
    
    RMContainer reservedContainer = node.getReservedContainer();
    if (reservedContainer != null) {
      return handleReservedContainer(reservedContainer, clusterResource);
    }
    
    return assignContainersToApplications(clusterResource, node, currentResourceLimits);
  }

  private CSAssignment handleReservedContainer(RMContainer reservedContainer, 
      Resource clusterResource) {
    FiCaSchedulerApp application = 
        getApplication(reservedContainer.getApplicationAttemptId());
    synchronized (application) {
      return assignReservedContainer(application, scheduler.getNode(
          reservedContainer.getContainer().getNodeId()), reservedContainer,
          clusterResource);
    }
  }

  private CSAssignment assignContainersToApplications(Resource clusterResource,
      FiCaSchedulerNode node, ResourceLimits currentResourceLimits) {
    for (FiCaSchedulerApp application : activeApplications) {
      CSAssignment assignment = assignContainersToApplication(application, 
          clusterResource, node, currentResourceLimits);
      if (assignment != null) {
        return assignment;
      }
    }
    return NULL_ASSIGNMENT;
  }

  private CSAssignment assignContainersToApplication(FiCaSchedulerApp application,
      Resource clusterResource, FiCaSchedulerNode node, 
      ResourceLimits currentResourceLimits) {
    if(LOG.isDebugEnabled()) {
      LOG.debug("pre-assignContainers for application "
          + application.getApplicationId());
      application.showRequests();
    }

    synchronized (application) {
      if (SchedulerAppUtils.isBlacklisted(application, node, LOG)) {
        return null;
      }
      
      CSAssignment assignment = assignContainersForPriorities(application, 
          clusterResource, node, currentResourceLimits);
      
      if(LOG.isDebugEnabled()) {
        LOG.debug("post-assignContainers for application "
            + application.getApplicationId());
        application.showRequests();
      }
      
      return assignment;
    }
  }

  private CSAssignment assignContainersForPriorities(FiCaSchedulerApp application,
      Resource clusterResource, FiCaSchedulerNode node, 
      ResourceLimits currentResourceLimits) {
    for (Priority priority : application.getPriorities()) {
      CSAssignment assignment = assignContainersForPriority(application, priority,
          clusterResource, node, currentResourceLimits);
      if (assignment != null) {
        return assignment;
      }
    }
    return null;
  }

  private CSAssignment assignContainersForPriority(FiCaSchedulerApp application,
      Priority priority, Resource clusterResource, FiCaSchedulerNode node,
      ResourceLimits currentResourceLimits) {
    ResourceRequest anyRequest =
        application.getResourceRequest(priority, ResourceRequest.ANY);
    if (null == anyRequest) {
      return null;
    }
    
    Resource required = anyRequest.getCapability();

    if (application.getTotalRequiredResources(priority) <= 0) {
      return null;
    }
    
    if (!this.reservationsContinueLooking) {
      if (!shouldAllocOrReserveNewContainer(application, priority, required)) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("doesn't need containers based on reservation algo!");
        }
        return null;
      }
    }
    
    Set<String> requestedNodeLabels =
        getRequestLabelSetByExpression(anyRequest.getNodeLabelExpression());

    Resource userLimit = 
        computeUserLimitAndSetHeadroom(application, clusterResource, 
            required, requestedNodeLabels);          
    
    if (!super.canAssignToThisQueue(clusterResource, node.getLabels(),
        currentResourceLimits, required, application.getCurrentReservation())) {
      return NULL_ASSIGNMENT;
    }

    if (!assignToUser(clusterResource, application.getUser(), userLimit,
        application, requestedNodeLabels, currentResourceLimits)) {
      return null;
    }

    application.addSchedulingOpportunity(priority);
    
    CSAssignment assignment =  
        assignContainersOnNode(clusterResource, node, application, priority, 
            null, currentResourceLimits);

    if (assignment.getSkipped()) {
      application.subtractSchedulingOpportunity(priority);
      return null;
    }
    
    Resource assigned = assignment.getResource();
    if (Resources.greaterThan(
        resourceCalculator, clusterResource, assigned, Resources.none())) {

      allocateResource(clusterResource, application, assigned,
          node.getLabels());
      
      if (assignment.getType() != NodeType.OFF_SWITCH) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Resetting scheduling opportunities");
        }
        application.resetSchedulingOpportunities(priority);
      }
      
      return assignment;
    }
    
    return null;
  }

  private synchronized CSAssignment assignReservedContainer(
      FiCaSchedulerApp application, FiCaSchedulerNode node,
      RMContainer rmContainer, Resource clusterResource) {
    Priority priority = rmContainer.getReservedPriority();
    if (application.getTotalRequiredResources(priority) == 0) {
      return new CSAssignment(application, rmContainer);
    }

    assignContainersOnNode(clusterResource, node, application, priority, 
        rmContainer, new ResourceLimits(Resources.none()));
    
    return new CSAssignment(Resources.none(), NodeType.NODE_LOCAL);
  }
  
  protected Resource getHeadroom(User user, Resource queueCurrentLimit,
      Resource clusterResource, FiCaSchedulerApp application, Resource required) {
    return getHeadroom(user, queueCurrentLimit, clusterResource,
        computeUserLimit(application, clusterResource, required, user, null));
  }
  
  private Resource getHeadroom(User user, Resource currentResourceLimit,
      Resource clusterResource, Resource userLimit) {
    Resource headroom = 
        Resources.min(resourceCalculator, clusterResource,
            Resources.subtract(userLimit, user.getUsed()),
            Resources.subtract(currentResourceLimit, queueUsage.getUsed())
        );
    headroom =
        Resources.roundDown(resourceCalculator, headroom, minimumAllocation);
    return headroom;
  }
  
  private void setQueueResourceLimitsInfo(
      Resource clusterResource) {
    synchronized (queueResourceLimitsInfo) {
      queueResourceLimitsInfo.setQueueCurrentLimit(cachedResourceLimitsForHeadroom
          .getLimit());
      queueResourceLimitsInfo.setClusterResource(clusterResource);
    }
  }

  @Lock({LeafQueue.class, FiCaSchedulerApp.class})
  Resource computeUserLimitAndSetHeadroom(FiCaSchedulerApp application,
      Resource clusterResource, Resource required, Set<String> requestedLabels) {
    String user = application.getUser();
    User queueUser = getUser(user);

    Resource userLimit =
        computeUserLimit(application, clusterResource, required,
            queueUser, requestedLabels);

    setQueueResourceLimitsInfo(clusterResource);
    
    Resource headroom =
        getHeadroom(queueUser, cachedResourceLimitsForHeadroom.getLimit(),
            clusterResource, userLimit);
    
    if (LOG.isDebugEnabled()) {
      LOG.debug("Headroom calculation for user " + user + ": " + 
          " userLimit=" + userLimit + 
          " queueMaxAvailRes=" + cachedResourceLimitsForHeadroom.getLimit() +
          " consumed=" + queueUser.getUsed() + 
          " headroom=" + headroom);
    }
    
    CapacityHeadroomProvider headroomProvider = new CapacityHeadroomProvider(
        queueUser, this, application, required, queueResourceLimitsInfo);
    
    application.setHeadroomProvider(headroomProvider);

    metrics.setAvailableResourcesToUser(user, headroom);
    
    return userLimit;
  }
  
  @Lock(NoLock.class)
  private Resource computeUserLimit(FiCaSchedulerApp application,
      Resource clusterResource, Resource required, User user,
      Set<String> requestedLabels) {
    Resource queueCapacity = computeQueueCapacity(clusterResource, requestedLabels);

    queueCapacity =
        Resources.max(
            resourceCalculator, clusterResource, 
            queueCapacity, 
            required);

    Resource currentCapacity =
        Resources.lessThan(resourceCalculator, clusterResource, 
            queueUsage.getUsed(), queueCapacity) ?
            queueCapacity : Resources.add(queueUsage.getUsed(), required);
    
    final int activeUsers = activeUsersManager.getNumActiveUsers();  
    
    Resource limit = computeUserResourceLimit(currentCapacity, queueCapacity);

    if (LOG.isDebugEnabled()) {
      String userName = application.getUser();
      LOG.debug("User limit computation for " + userName + 
          " in queue " + getQueueName() +
          " userLimit=" + userLimit +
          " userLimitFactor=" + userLimitFactor +
          " required: " + required + 
          " consumed: " + user.getUsed() + 
          " limit: " + limit +
          " queueCapacity: " + queueCapacity + 
          " qconsumed: " + queueUsage.getUsed() +
          " currentCapacity: " + currentCapacity +
          " activeUsers: " + activeUsers +
          " clusterCapacity: " + clusterResource
      );
    }
    user.setUserResourceLimit(limit);
    return limit;
  }

  private Resource computeQueueCapacity(Resource clusterResource, Set<String> requestedLabels) {
    Resource queueCapacity = Resource.newInstance(0, 0);
    if (requestedLabels != null && !requestedLabels.isEmpty()) {
      String firstLabel = requestedLabels.iterator().next();
      queueCapacity =
          Resources.max(resourceCalculator, clusterResource, queueCapacity,
              Resources.multiplyAndNormalizeUp(resourceCalculator,
                  labelManager.getResourceByLabel(firstLabel,
                      clusterResource),
                  queueCapacities.getAbsoluteCapacity(firstLabel),
                  minimumAllocation));
    } else {
      queueCapacity =
          Resources.multiplyAndNormalizeUp(resourceCalculator, labelManager
              .getResourceByLabel(CommonNodeLabelsManager.NO_LABEL, clusterResource),
              queueCapacities.getAbsoluteCapacity(), minimumAllocation);
    }
    return queueCapacity;
  }

  private Resource computeUserResourceLimit(Resource currentCapacity, Resource queueCapacity) {
    final int activeUsers = activeUsersManager.getNumActiveUsers();
    
    Resource limit =
        Resources.roundUp(
            resourceCalculator, 
            Resources.min(
                resourceCalculator, lastClusterResource,   
                Resources.max(
                    resourceCalculator, lastClusterResource, 
                    Resources.divideAndCeil(
                        resourceCalculator, currentCapacity, activeUsers),
                    Resources.divideAndCeil(
                        resourceCalculator, 
                        Resources.multiplyAndRoundDown(
                            currentCapacity, userLimit), 
                        100)
                ), 
                Resources.multiplyAndRoundDown(queueCapacity, userLimitFactor)
            ), 
            minimumAllocation);
    return limit;
  }
  
  @Private
  protected synchronized boolean assignToUser(Resource clusterResource,
      String userName, Resource limit, FiCaSchedulerApp application,
      Set<String> requestLabels, ResourceLimits currentResoureLimits) {
    User user = getUser(userName);
    
    String label = CommonNodeLabelsManager.NO_LABEL;
    if (requestLabels != null && !requestLabels.isEmpty()) {
      label = requestLabels.iterator().next();
    }

    if (Resources.greaterThan(resourceCalculator, clusterResource,
        user.getUsed(label), limit)) {
      return handleUserLimitExceeded(user, userName, clusterResource, 
          application, limit, currentResoureLimits);
    }
    return true;
  }

  private boolean handleUserLimitExceeded(User user, String userName, 
      Resource clusterResource, FiCaSchedulerApp application, Resource limit,
      ResourceLimits currentResoureLimits) {
    if (this.reservationsContinueLooking) {
      if (Resources.lessThanOrEqual(
          resourceCalculator,
          clusterResource,
          Resources.subtract(user.getUsed(), application.getCurrentReservation()),
          limit)) {

        if (LOG.isDebugEnabled()) {
          LOG.debug("User " + userName + " in queue " + getQueueName()
              + " will exceed limit based on reservations - " + " consumed: "
              + user.getUsed() + " reserved: "
              + application.getCurrentReservation() + " limit: " + limit);
        }
        Resource amountNeededToUnreserve = Resources.subtract(user.getUsed(), limit);
        currentResoureLimits.setAmountNeededUnreserve(Resources.max(resourceCalculator,
            clusterResource, currentResoureLimits.getAmountNeededUnreserve(),
            amountNeededToUnreserve));
        return true;
      }
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("User " + userName + " in queue " + getQueueName()
          + " will exceed limit - " + " consumed: "
          + user.getUsed() + " limit: " + limit);
    }
    return false;
  }

  boolean shouldAllocOrReserveNewContainer(FiCaSchedulerApp application,
      Priority priority, Resource required) {
    int requiredContainers = application.getTotalRequiredResources(priority);
    int reservedContainers = application.getNumReservedContainers(priority);
    int starvation = 0;
    if (reservedContainers > 0) {
      float nodeFactor = 
          Resources.ratio(
              resourceCalculator, required, getMaximumAllocation()
              );
      
      starvation = 
          (int)((application.getReReservations(priority) / (float)reservedContainers) * 
                (1.0f - (Math.min(nodeFactor, getMinimumAllocationFactor())))
               );
      
      if (LOG.isDebugEnabled()) {
        LOG.debug("needsContainers:" +
            " app.#re-reserve=" + application.getReReservations(priority) + 
            " reserved=" + reservedContainers + 
            " nodeFactor=" + nodeFactor + 
            " minAllocFactor=" + getMinimumAllocationFactor() +
            " starvation=" + starvation);
      }
    }
    return (((starvation + requiredContainers) - reservedContainers) > 0);
  }

  private CSAssignment assignContainersOnNode(Resource clusterResource,
      FiCaSchedulerNode node, FiCaSchedulerApp application, Priority priority,
      RMContainer reservedContainer, ResourceLimits currentResoureLimits) {
    Resource assigned = Resources.none();

    NodeType requestType = null;
    MutableObject allocatedContainer = new MutableObject();
    
    CSAssignment assignment = tryAssignNodeLocalContainers(clusterResource, node, 
        application, priority, reservedContainer, allocatedContainer, currentResoureLimits);
    if (assignment != null) {
      return assignment;
    }

    assignment = tryAssignRackLocalContainers(clusterResource, node, 
        application, priority, reservedContainer, allocatedContainer, currentResoureLimits);
    if (assignment != null) {
      return assignment;
    }
    
    assignment = tryAssignOffSwitchContainers(clusterResource, node, 
        application, priority, reservedContainer, allocatedContainer, currentResoureLimits);
    if (assignment != null) {
      return assignment;
    }
    
    return SKIP_ASSIGNMENT;
  }

  private CSAssignment tryAssignNodeLocalContainers(Resource clusterResource,
      FiCaSchedulerNode node, FiCaSchedulerApp application, Priority priority,
      RMContainer reservedContainer, MutableObject allocatedContainer,
      ResourceLimits currentResoureLimits) {
    ResourceRequest nodeLocalResourceRequest =
        application.getResourceRequest(priority, node.getNodeName());
    if (nodeLocalResourceRequest != null) {
      Resource assigned =
          assignNodeLocalContainers(clusterResource, nodeLocalResourceRequest, 
              node, application, priority, reservedContainer,
              allocatedContainer, currentResoureLimits);
      if (Resources.greaterThan(resourceCalculator, clusterResource,
          assigned, Resources.none())) {
        if (allocatedContainer.getValue() != null) {
          application.incNumAllocatedContainers(NodeType.NODE_LOCAL,
              NodeType.NODE_LOCAL);
        }
        return new CSAssignment(assigned, NodeType.NODE_LOCAL);
      }
    }
    return null;
  }

  private CSAssignment tryAssignRackLocalContainers(Resource clusterResource,
      FiCaSchedulerNode node, FiCaSchedulerApp application, Priority priority,
      RMContainer reservedContainer, MutableObject allocatedContainer,
      ResourceLimits currentResoureLimits) {
    ResourceRequest rackLocalResourceRequest =
        application.getResourceRequest(priority, node.getRackName());
    if (rackLocalResourceRequest != null) {
      if (!rackLocalResourceRequest.getRelaxLocality()) {
        return SKIP_ASSIGNMENT;
      }

      Resource assigned = 
          assignRackLocalContainers(clusterResource, rackLocalResourceRequest, 
              node, application, priority, reservedContainer,
              allocatedContainer, currentResoureLimits);
      if (Resources.greaterThan(resourceCalculator, clusterResource,
          assigned, Resources.none())) {
        if (allocatedContainer.getValue() != null) {
          application.incNumAllocatedContainers(NodeType.RACK_LOCAL,
              NodeType.RACK_LOCAL);
        }
        return new CSAssignment(assigned, NodeType.RACK_LOCAL);
      }
    }
    return null;
  }

  private CSAssignment tryAssignOffSwitchContainers(Resource clusterResource,
      FiCaSchedulerNode node, FiCaSchedulerApp application, Priority priority,
      RMContainer reservedContainer, MutableObject allocatedContainer,
      ResourceLimits currentResoureLimits) {
    ResourceRequest offSwitchResourceRequest =
        application.getResourceRequest(priority, ResourceRequest.ANY);
    if (offSwitchResourceRequest != null) {
      if (!offSwitchResourceRequest.getRelaxLocality()) {
        return SKIP_ASSIGNMENT;
      }

      Resource assigned =
          assignOffSwitchContainers(clusterResource, offSwitchResourceRequest,
              node, application, priority, reservedContainer,
              allocatedContainer, currentResoureLimits);

      if (allocatedContainer.getValue() != null) {
        application.incNumAllocatedContainers(NodeType.OFF_SWITCH, NodeType.OFF_SWITCH);
      }
      return new CSAssignment(assigned, NodeType.OFF_SWITCH);
    }
    return null;
  }

  @Private
  protected boolean findNodeToUnreserve(Resource clusterResource,
      FiCaSchedulerNode node, FiCaSchedulerApp application, Priority priority,
      Resource minimumUnreservedResource) {
    NodeId idToUnreserve =
        application.getNodeIdToUnreserve(priority, minimumUnreservedResource,
            resourceCalculator, clusterResource);
    if (idToUnreserve == null) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("checked to see if could unreserve for app but nothing "
            + "reserved that matches for this app");
      }
      return false;
    }
    FiCaSchedulerNode nodeToUnreserve = scheduler.getNode(idToUnreserve);
    if (nodeToUnreserve == null) {
      LOG.error("node to unreserve doesn't exist, nodeid: " + idToUnreserve);
      return false;
    }
    if (LOG.isDebugEnabled()) {
      LOG.debug("unreserving for app: " + application.getApplicationId()
          + " on nodeId: " + idToUnreserve
          + " in order to replace reserved application and place it on node: "
          + node.getNodeID() + " needing: " + minimumUnreservedResource);
    }

    Resources.addTo(application.getHeadroom(), nodeToUnreserve
        .getReservedContainer().getReservedResource());

    completedContainer(clusterResource, application, nodeToUnreserve,
        nodeToUnreserve.getReservedContainer(),
        SchedulerUtils.createAbnormalContainerStatus(nodeToUnreserve
            .getReservedContainer().getContainerId(),
            SchedulerUtils.UNRESERVED_CONTAINER),
        RMContainerEventType.RELEASED, null, false);
    return true;
  }

  private Resource assignNodeLocalContainers(Resource clusterResource,
      ResourceRequest nodeLocalResourceRequest, FiCaSchedulerNode node,
      FiCaSchedulerApp application, Priority priority,
      RMContainer reservedContainer, MutableObject allocatedContainer,
      ResourceLimits currentResoureLimits) {
    if (canAssign(application, priority, node, NodeType.NODE_LOCAL, 
        reservedContainer)) {
      return assignContainer(clusterResource, node, application, priority,
          nodeLocalResourceRequest, NodeType.NODE_LOCAL, reservedContainer,
          allocatedContainer, currentResoureLimits);
    }
    
    return Resources.none();
  }

  private Resource assignRackLocalContainers(Resource clusterResource,
      ResourceRequest rackLocalResourceRequest, FiCaSchedulerNode node,
      FiCaSchedulerApp application, Priority priority,
      RMContainer reservedContainer, MutableObject allocatedContainer,
      ResourceLimits currentResoureLimits) {
    if (canAssign(application, priority, node, NodeType.RACK_LOCAL,
        reservedContainer)) {
      return assignContainer(clusterResource, node, application, priority,
          rackLocalResourceRequest, NodeType.RACK_LOCAL, reservedContainer,
          allocatedContainer, currentResoureLimits);
    }
    
    return Resources.none();
  }

  private Resource assignOffSwitchContainers(Resource clusterResource,
      ResourceRequest offSwitchResourceRequest, FiCaSchedulerNode node,
      FiCaSchedulerApp application, Priority priority,
      RMContainer reservedContainer, MutableObject allocatedContainer,
      ResourceLimits currentResoureLimits) {
    if (canAssign(application, priority, node, NodeType.OFF_SWITCH,
        reservedContainer)) {
      return assignContainer(clusterResource, node, application, priority,
          offSwitchResourceRequest, NodeType.OFF_SWITCH, reservedContainer,
          allocatedContainer, currentResoureLimits);
    }
    
    return Resources.none();
  }

  boolean canAssign(FiCaSchedulerApp application, Priority priority, 
      FiCaSchedulerNode node, NodeType type, RMContainer reservedContainer) {

    if (type == NodeType.OFF_SWITCH) {
      return canAssignOffSwitch(application, priority, reservedContainer);
    }

    ResourceRequest rackLocalRequest = 
        application.getResourceRequest(priority, node.getRackName());
    if (rackLocalRequest == null || rackLocalRequest.getNumContainers() <= 0) {
      return false;
    }
      
    if (type == NodeType.RACK_LOCAL) {
      return canAssignRackLocal(application, priority);
    }

    if (type == NodeType.NODE_LOCAL) {
      return canAssignNodeLocal(application, priority, node);
    }

    return false;
  }

  private boolean canAssignOffSwitch(FiCaSchedulerApp application, Priority priority,
      RMContainer reservedContainer) {
    if (reservedContainer != null) {
      return true;
    }

    ResourceRequest offSwitchRequest = 
        application.getResourceRequest(priority, ResourceRequest.ANY);
    long missedOpportunities = application.getSchedulingOpportunities(priority);
    long requiredContainers = offSwitchRequest.getNumContainers(); 
    
    float localityWaitFactor = 
        application.getLocalityWaitFactor(priority, 
            scheduler.getNumClusterNodes());
    
    return ((requiredContainers * localityWaitFactor) < missedOpportunities);
  }

  private boolean canAssignRackLocal(FiCaSchedulerApp application, Priority priority) {
    long missedOpportunities = application.getSchedulingOpportunities(priority);
    return (
        Math.min(scheduler.getNumClusterNodes(), getNodeLocalityDelay()) < 
        missedOpportunities
    );
  }

  private boolean canAssignNodeLocal(FiCaSchedulerApp application, Priority priority,
      FiCaSchedulerNode node) {
    ResourceRequest nodeLocalRequest = 
        application.getResourceRequest(priority, node.getNodeName());
    if (nodeLocalRequest != null) {
      return nodeLocalRequest.getNumContainers() > 0;
    }
    return false;
  }
  
  private Container getContainer(RMContainer rmContainer, 
      FiCaSchedulerApp application, FiCaSchedulerNode node, 
      Resource capability, Priority priority) {
    return (rmContainer != null) ? rmContainer.getContainer() :
        createContainer(application, node, capability, priority);
  }

  Container createContainer(FiCaSchedulerApp application, FiCaSchedulerNode node, 
      Resource capability, Priority priority) {
  
    NodeId nodeId = node.getRMNode().getNodeID();
    ContainerId containerId = BuilderUtils.newContainerId(application
        .getApplicationAttemptId(), application.getNewContainerId());
  
    Container container =
        BuilderUtils.newContainer(containerId, nodeId, node.getRMNode()
            .getHttpAddress(), capability, priority, null);
  
    return container;
  }

  private Resource assignContainer(Resource clusterResource, FiCaSchedulerNode node, 
      FiCaSchedulerApp application, Priority priority, 
      ResourceRequest request, NodeType type, RMContainer rmContainer,
      MutableObject createdContainer, ResourceLimits currentResoureLimits) {
    if (LOG.isDebugEnabled()) {
      LOG.debug("assignContainers: node=" + node.getNodeName()
          + " application=" + application.getApplicationId()
          + " priority=" + priority.getPriority()
          + " request=" + request + " type=" + type);
    }
    
    if (!SchedulerUtils.checkNodeLabelExpression(
        node.getLabels(),
        request.getNodeLabelExpression())) {
      if (rmContainer != null) {
        unreserve(application, priority, node, rmContainer);
      }
      return Resources.none();
    }
    
    Resource capability = request.getCapability();
    Resource available = node.getAvailableResource();
    Resource totalResource = node.getTotalResource();

    if (!Resources.lessThanOrEqual(resourceCalculator, clusterResource,
        capability, totalResource)) {
      LOG.warn("Node : " + node.getNodeID()
          + " does not have sufficient resource for request : " + request
          + " node total capability : " + node.getTotalResource());
      return Resources.none();
    }

    assert Resources.greaterThan(
        resourceCalculator, clusterResource, available, Resources.none());

    Container container = 
        getContainer(rmContainer, application, node, capability, priority);
  
    if (container == null) {
      LOG.warn("Couldn't get container for allocation!");
      return Resources.none();
    }
    
    boolean shouldAllocOrReserveNewContainer = shouldAllocOrReserveNewContainer(
        application, priority, capability);

    int availableContainers = 
        resourceCalculator.computeAvailableContainers(available, capability);

    boolean needToUnreserve = Resources.greaterThan(resourceCalculator,clusterResource,
        currentResoureLimits.getAmountNeededUnreserve(), Resources.none());

    if (availableContainers > 0) {
      return handleContainerAllocation(clusterResource, node, application, priority,
          request, rmContainer, createdContainer, currentResoureLimits,
          shouldAllocOrReserveNewContainer, needToUnreserve, container);
    } else {
      return handleContainerReservation(shouldAllocOrReserveNewContainer, rmContainer,
          request);
    }
  }

  private Resource handleContainerAllocation(Resource clusterResource, FiCaSchedulerNode node,
      FiCaSchedulerApp application, Priority priority, ResourceRequest request,
      RMContainer rmContainer, MutableObject createdContainer, ResourceLimits currentResoureLimits,
      boolean shouldAllocOrReserveNewContainer, boolean needToUnreserve, Container container) {
    if (rmContainer != null) {
      unreserve(application, priority, node, rmContainer);
    } else if (this.reservationsContinueLooking && node.getLabels().isEmpty()) {
      if (!shouldAllocOrReserveNewContainer || needToUnreserve) {
        Resource amountToUnreserve = request.getCapability();
        if (needToUnreserve) {
          amountToUnreserve = currentResoureLimits.getAmountNeededUnreserve();
        }
        boolean containerUnreserved =
            findNodeToUnreserve(clusterResource, node, application, priority,
                amountToUnreserve);
        if (!containerUnreserved) {
          return Resources.none();
        }
      }
    }

    RMContainer allocatedContainer = 
        application.allocate(NodeType.NODE_LOCAL, node, priority, request, container);

    if (allocatedContainer == null) {
      return Resources.none();
    }

    node.allocateContainer(allocatedContainer);

    LOG.info("assignedContainer" +
        " application attempt=" + application.getApplicationAttemptId() +
        " container=" + container + 
        " queue=" + this + 
        " clusterResource=" + clusterResource);
    createdContainer.setValue(allocatedContainer);
    return container.getResource();
  }

  private Resource handleContainerReservation(boolean shouldAllocOrReserveNewContainer,
      RMContainer rmContainer, ResourceRequest request) {
    if (shouldAllocOrReserveNewContainer || rmContainer != null) {
      return request.getCapability();
    }
    return Resources.none();
  }

  private void reserve(FiCaSchedulerApp application, Priority priority, 
      FiCaSchedulerNode node, RMContainer rmContainer, Container container) {
    if (rmContainer == null) {
      getMetrics().reserveResource(
          application.getUser(), container.getResource());
    }

    rmContainer = application.reserve(node, priority, rmContainer, container);
    node.reserveResource(application, priority, rmContainer);
  }

  private boolean unreserve(FiCaSchedulerApp application, Priority priority,
      FiCaSchedulerNode node, RMContainer rmContainer) {
    if (application.unreserve(node, priority)) {
      node.unreserveResource(application);

      getMetrics().unreserveResource(application.getUser(),
          rmContainer.getContainer().getResource());
      return true;
    }
    return false;
  }

  @Override
  public void completedContainer(Resource clusterResource, 
      FiCaSchedulerApp application, FiCaSchedulerNode node, RMContainer rmContainer, 
      ContainerStatus containerStatus, RMContainerEventType event, CSQueue childQueue,
      boolean sortQueues) {
    if (application != null) {

      boolean removed = false;

      synchronized (this) {

        Container container = rmContainer.getContainer();

        if (rmContainer.getState() == RMContainerState.RESERVED) {
          removed = unreserve(application, rmContainer.getReservedPriority(),
              node, rmContainer);
        } else {
          removed =
              application.containerCompleted(rmContainer, containerStatus, event);
          node.releaseContainer(container);
        }

        if (removed) {
          releaseResource(clusterResource, application,
              container.getResource(), node.getLabels());
          LOG.info("completedContainer" +
              " container=" + container +
              " queue=" + this +
              " cluster=" + clusterResource);
        }
      }

      if (removed) {
        getParent().completedContainer(clusterResource, application, node,
            rmContainer, null, event, this, sortQueues);
      }
    }
  }

  synchronized void allocateResource(Resource clusterResource,
      SchedulerApplicationAttempt application, Resource resource,
      Set<String> nodeLabels) {
    super.allocateResource(clusterResource, resource, nodeLabels);
    
    String userName = application.getUser();
    User user = getUser(userName);
    user.assignContainer(resource, nodeLabels);
    Resources.subtractFrom(application.getHeadroom(), resource);
    metrics.setAvailableResourcesToUser(userName, application.getHeadroom());
    
    if (LOG.isDebugEnabled()) {
      LOG.info(getQueueName() + 
          " user=" + userName + 
          " used=" + queueUsage.getUsed() + " numContainers=" + numContainers +
          " headroom = " + application.getHeadroom() +
          " user-resources=" + user.getUsed()
          );
    }
  }

  synchronized void releaseResource(Resource clusterResource, 
      FiCaSchedulerApp application, Resource resource, Set<String> nodeLabels) {
    super.releaseResource(clusterResource, resource, nodeLabels);
    
    String userName = application.getUser();
    User user = getUser(userName);
    user.releaseContainer(resource, nodeLabels);
    metrics.setAvailableResourcesToUser(userName, application.getHeadroom());
      
    LOG.info(getQueueName() +
        " used=" + queueUsage.getUsed() + " numContainers=" + numContainers +
        " user=" + userName + " user-resources=" + user.getUsed());
  }
  
  private void updateAbsoluteCapacityResource(Resource clusterResource) {
    absoluteCapacityResource =
        Resources.multiplyAndNormalizeUp(resourceCalculator, clusterResource,
            queueCapacities.getAbsoluteCapacity(), minimumAllocation);
  }
  
  private void updateCurrentResourceLimits(
      ResourceLimits currentResourceLimits, Resource clusterResource) {
    this.cachedResourceLimitsForHeadroom = new ResourceLimits(currentResourceLimits.getLimit());
    Resource queueMaxResource =
        Resources.multiplyAndNormalizeDown(resourceCalculator, labelManager
            .getResourceByLabel(RMNodeLabelsManager.NO_LABEL, clusterResource),
            queueCapacities
                .getAbsoluteMaximumCapacity(RMNodeLabelsManager.NO_LABEL),
            minimumAllocation);
    this.cachedResourceLimitsForHeadroom.setLimit(Resources.min(resourceCalculator,
        clusterResource, queueMaxResource, currentResourceLimits.getLimit()));
  }

  @Override
  public synchronized void updateClusterResource(Resource clusterResource,
      ResourceLimits currentResourceLimits) {
    updateCurrentResourceLimits(currentResourceLimits, clusterResource);
    lastClusterResource = clusterResource;
    updateAbsoluteCapacityResource(clusterResource);
    
    setQueueResourceLimitsInfo(clusterResource);
    
    CSQueueUtils.updateQueueStatistics(
        resourceCalculator, this, getParent(), clusterResource, 
        minimumAllocation);

    activateApplications();

    for (FiCaSchedulerApp application : activeApplications) {
      synchronized (application) {
        computeUserLimitAndSetHeadroom(application, clusterResource, 
            Resources.none(), null);
      }
    }
  }

  @VisibleForTesting
  public static class User {
    ResourceUsage userResourceUsage = new ResourceUsage();
    volatile Resource userResourceLimit = Resource.newInstance(0, 0);
    int pendingApplications = 0;
    int activeApplications = 0;

    public ResourceUsage getResourceUsage() {
      return userResourceUsage;
    }
    
    public Resource getUsed() {
      return userResourceUsage.getUsed();
    }
    
    public Resource getUsed(String label) {
      return userResourceUsage.getUsed(label);
    }

    public int getPendingApplications() {
      return pendingApplications;
    }

    public int getActiveApplications() {
      return activeApplications;
    }
    
    public Resource getConsumedAMResources() {
      return userResourceUsage.getAMUsed();
    }

    public int getTotalApplications() {
      return getPendingApplications() + getActiveApplications();
    }
    
    public synchronized void submitApplication() {
      ++pendingApplications;
    }
    
    public synchronized void activateApplication() {
      --pendingApplications;
      ++activeApplications;
    }

    public synchronized void finishApplication(boolean wasActive) {
      if (wasActive) {
        --activeApplications;
      }
      else {
        --pendingApplications;
      }
    }

    public void assignContainer(Resource resource,
        Set<String> nodeLabels) {
      if (nodeLabels == null || nodeLabels.isEmpty()) {
        userResourceUsage.incUsed(resource);
      } else {
        for (String label : nodeLabels) {
          userResourceUsage.incUsed(label, resource);
        }
      }
    }

    public void releaseContainer(Resource resource, Set<String> nodeLabels) {
      if (nodeLabels == null || nodeLabels.isEmpty()) {
        userResourceUsage.decUsed(resource);
      } else {
        for (String label : nodeLabels) {
          userResourceUsage.decUsed(label, resource);
        }
      }
    }

    public Resource getUserResourceLimit() {
      return userResourceLimit;
    }

    public void setUserResourceLimit(Resource userResourceLimit) {
      this.userResourceLimit = userResourceLimit;
    }
  }

  @Override
  public void recoverContainer(Resource clusterResource,
      SchedulerApplicationAttempt attempt, RMContainer rmContainer) {
    if (rmContainer.getState().equals(RMContainerState.COMPLETED)) {
      return;
    }
    synchronized (this) {
      FiCaSchedulerNode node =
          scheduler.getNode(rmContainer.getContainer().getNodeId());
      allocateResource(clusterResource, attempt, rmContainer.getContainer()
          .getResource(), node.getLabels());
    }
    getParent().recoverContainer(clusterResource, attempt, rmContainer);
  }

  public Set<FiCaSchedulerApp> getApplications() {
    return activeApplications;
  }

  public synchronized Resource getTotalResourcePending() {
    Resource ret = BuilderUtils.newResource(0, 0);
    for (FiCaSchedulerApp f : activeApplications) {
      Resources.addTo(ret, f.getTotalPendingRequests());
    }
    return ret;
  }

  @Override
  public synchronized void collectSchedulerApplications(
      Collection<ApplicationAttemptId> apps) {
    for (FiCaSchedulerApp pendingApp : pendingApplications) {
      apps.add(pendingApp.getApplicationAttemptId());
    }
    for (FiCaSchedulerApp app : activeApplications) {
      apps.add(app.getApplicationAttemptId());
    }
  }

  @Override
  public void attachContainer(Resource clusterResource,
      FiCaSchedulerApp application, RMContainer rmContainer) {
    if (application != null) {
      FiCaSchedulerNode node =
          scheduler.getNode(rmContainer.getContainer().getNodeId());
      allocateResource(clusterResource, application, rmContainer.getContainer()
          .getResource(), node.getLabels());
      LOG.info("movedContainer" + " container=" + rmContainer.getContainer()
          + " resource=" + rmContainer.getContainer().getResource()
          + " queueMoveIn=" + this + " usedCapacity=" + getUsedCapacity()
          + " absoluteUsedCapacity=" + getAbsoluteUsedCapacity() + " used="
          + queueUsage.getUsed() + " cluster=" + clusterResource);
      getParent().attachContainer(clusterResource, application, rmContainer);
    }
  }

  @Override
  public void detachContainer(Resource clusterResource,
      FiCaSchedulerApp application, RMContainer rmContainer) {
    if (application != null) {
      FiCaSchedulerNode node =
          scheduler.getNode(rmContainer.getContainer().getNodeId());
      releaseResource(clusterResource, application, rmContainer.getContainer()
          .getResource(), node.getLabels());
      LOG.info("movedContainer" + " container=" + rmContainer.getContainer()
          + " resource=" + rmContainer.getContainer().getResource()
          + " queueMoveOut=" + this + " usedCapacity=" + getUsedCapacity()
          + " absoluteUsedCapacity=" + getAbsoluteUsedCapacity() + " used="
          + queueUsage.getUsed() + " cluster=" + clusterResource);
      getParent().detachContainer(clusterResource, application, rmContainer);
    }
  }
  
  public void setCapacity(float capacity) {
    queueCapacities.setCapacity(capacity);
  }

  public void setAbsoluteCapacity(float absoluteCapacity) {
    queueCapacities.setAbsoluteCapacity(absoluteCapacity);
  }

  public void setMaxApplications(int maxApplications) {
    this.maxApplications = maxApplications;
  }
  
  static class QueueResourceLimitsInfo {
    private Resource queueCurrentLimit;
    private Resource clusterResource;
    
    public void setQueueCurrentLimit(Resource currentLimit) {
      this.queueCurrentLimit = currentLimit;
    }
    
    public Resource getQueueCurrentLimit() {
      return queueCurrentLimit;
    }
    
    public void setClusterResource(Resource clusterResource) {
      this.clusterResource = clusterResource;
    }
    
    public Resource getClusterResource() {
      return clusterResource;
    }
  }
}
```javascript
import moment from 'moment-timezone';
import {action} from '@ember/object';
import {htmlSafe} from '@ember/template';
import {task} from 'ember-concurrency';
import {tracked} from '@glimmer/tracking';

export default class PublishOptions {
    // passed in services
    config = null;
    limit = null;
    settings = null;
    store = null;
    membersCountCache = null;

    // passed in models
    post = null;
    user = null;

    @tracked publishDisabledError = null;
    @tracked totalMemberCount = 0;

    get isLoading() {
        return this.setupTask.isRunning;
    }

    get willEmail() {
        return (
            (this.publishType !== 'publish'
                && this.recipientFilter
                && this.post.isDraft
                && !this.post.email
            )
                || (this.post.isDraft && this.post.email && this.post.email.status === 'failed')
        );
    }

    get willEmailImmediately() {
        return this.willEmail && !this.isScheduled;
    }

    get willPublish() {
        return this.publishType !== 'send';
    }

    get willOnlyEmail() {
        return this.publishType === 'send';
    }

    // publish date ------------------------------------------------------------

    @tracked isScheduled = false;
    @tracked scheduledAtUTC = this.minScheduledAt;

    get minScheduledAt() {
        return moment.utc().add(5, 'seconds').milliseconds(0);
    }

    get defaultScheduledAt() {
        return moment.utc().add(10, 'minutes').milliseconds(0);
    }

    @action
    toggleScheduled(shouldSchedule) {
        if (shouldSchedule === undefined) {
            shouldSchedule = !this.isScheduled;
        }

        this.isScheduled = shouldSchedule;

        if (shouldSchedule && (!this.scheduledAtUTC || this.scheduledAtUTC.isBefore(this.defaultScheduledAt))) {
            this.scheduledAtUTC = this.defaultScheduledAt;
        }
    }

    @action
    setScheduledAt(date) {
        // API only stores seconds so providing non-zero milliseconds can
        // trigger unexpected validation when updating scheduled posts
        date = moment.utc(date).milliseconds(0);

        if (date.isBefore(this.minScheduledAt)) {
            this.scheduledAtUTC = this.minScheduledAt;
            return;
        }

        this.scheduledAtUTC = date;
    }

    @action
    resetPastScheduledAt() {
        if (this.scheduledAtUTC.isBefore(this.minScheduledAt)) {
            this.isScheduled = false;
            this.scheduledAt = null;
        }
    }

    // publish type ------------------------------------------------------------

    @tracked publishType = 'publish+send';
    @tracked emailDisabledError;

    get publishTypeOptions() {
        return [{
            value: 'publish+send',
            label: 'Publish and email',
            display: 'Publish and email',
            disabled: this.emailDisabled
        }, {
            value: 'publish',
            label: 'Publish only',
            display: 'Publish'
        }, {
            value: 'send',
            label: 'Email only',
            display: 'Email',
            disabled: this.emailDisabled
        }];
    }

    get selectedPublishTypeOption() {
        return this.publishTypeOptions.find(pto => pto.value === this.publishType);
    }

    get emailDisabledInSettings() {
        return this.settings.editorDefaultEmailRecipients === 'disabled'
            || this.settings.membersSignupAccess === 'none';
    }

    // publish type dropdown is not shown at all
    get emailUnavailable() {
        return this.post.isPage || this.post.email || this.emailDisabledInSettings;
    }

    // publish type dropdown is shown but email options are disabled
    get emailDisabled() {
        const hasNoMembers = this.totalMemberCount === 0;

        return !this.mailgunIsConfigured || hasNoMembers || this.emailDisabledError;
    }

    get mailgunIsConfigured() {
        return this.settings.mailgunIsConfigured
            || this.config.mailgunIsConfigured;
    }

    @action
    setPublishType(newValue) {
        // TODO: validate option is allowed when setting?
        this.publishType = newValue;
    }

    // recipients --------------------------------------------------------------

    // set in constructor because services are not injected
    allNewsletters = [];

    // both of these are set to site defaults in `setupTask`
    @tracked newsletter = null;
    @tracked selectedRecipientFilter = undefined;

    get newsletters() {
        return this.allNewsletters
            .filter(n => n.status === 'active')
            .sort(({sortOrder: a}, {sortOrder: b}) => a - b);
    }

    get defaultNewsletter() {
        return this.newsletters[0];
    }

    get onlyDefaultNewsletter() {
        return this.newsletters.length === 1;
    }

    get recipientFilter() {
        if (this.selectedRecipientFilter === undefined) {
            return (this.post.newsletter && this.post.emailSegment) || this.defaultRecipientFilter;
        } else {
            return this.selectedRecipientFilter;
        }
    }

    /**
     * Maps post visibility to recipient filter strings
     * @private
     */
    _visibilityToRecipientFilterMap = {
        'public': 'status:free,status:-free',
        'members': 'status:free,status:-free',
        'paid': 'status:-free'
    };

    /**
     * Determines the recipient filter based on post visibility
     * @private
     */
    _getFilterByVisibility() {
        const visibility = this.post.visibility;
        
        if (visibility === 'tiers') {
            return this.post.visibilitySegment;
        }

        return this._visibilityToRecipientFilterMap[visibility] || visibility;
    }

    /**
     * Determines if default recipient filter should use visibility-based logic
     * @private
     */
    _shouldUseVisibilityFilter() {
        const recipients = this.settings.editorDefaultEmailRecipients;
        const filter = this.settings.editorDefaultEmailRecipientsFilter;
        const usuallyNobody = recipients === 'filter' && filter === null;
        
        return recipients === 'visibility' || usuallyNobody;
    }

    get defaultRecipientFilter() {
        const recipients = this.settings.editorDefaultEmailRecipients;
        const filter = this.settings.editorDefaultEmailRecipientsFilter;

        if (recipients === 'disabled') {
            return null;
        }

        if (this._shouldUseVisibilityFilter()) {
            return this._getFilterByVisibility();
        }

        return filter;
    }

    get fullRecipientFilter() {
        let filter = this.newsletter.recipientFilter;

        if (this.recipientFilter) {
            filter += `+(${this.recipientFilter})`;
        }

        return filter;
    }

    @action
    setNewsletter(newsletter) {
        this.newsletter = newsletter;
    }

    @action
    setRecipientFilter(newFilter) {
        this.selectedRecipientFilter = newFilter;
    }

    // setup -------------------------------------------------------------------

    constructor({config, limit, post, settings, store, user, membersCountCache} = {}) {
        this.config = config;
        this.limit = limit;
        this.post = post;
        this.settings = settings;
        this.store = store;
        this.user = user;
        this.membersCountCache = membersCountCache;

        // this needs to be set here rather than a class-level property because
        // unlike Ember-based classes the services are not injected so can't be
        // used until after they are assigned above
        this.allNewsletters = this.store.peekAll('newsletter');

        this.setupTask.perform();
    }

    /**
     * Determines if publish type should be set to 'publish' based on email availability
     * @private
     */
    _shouldDisableEmailPublishing() {
        return this.emailUnavailable || this.emailDisabled;
    }

    /**
     * Determines if publish type should be set to 'publish' for "Usually nobody" default
     * @private
     */
    _isUsuallyNobodyDefault() {
        return this.settings.editorDefaultEmailRecipients === 'filter'
            && this.settings.editorDefaultEmailRecipientsFilter === null;
    }

    /**
     * Initializes publish type based on post state and settings
     * @private
     */
    _initializePublishType() {
        if (this._shouldDisableEmailPublishing()) {
            this.publishType = 'publish';
        }

        if (this._isUsuallyNobodyDefault()) {
            this.publishType = 'publish';
        }

        if (this.post.isSent) {
            this.publishType = 'send';
        }
    }

    @task
    *setupTask() {
        yield this.fetchRequiredDataTask.perform();

        // TODO: set up initial state / defaults

        this.newsletter = this.defaultNewsletter;
        this._initializePublishType();
    }

    /**
     * Collects promises for required data fetching
     * @private
     */
    _collectDataFetchPromises() {
        const promises = [];

        // total # of members - used to enable/disable email
        // Only Admins/Owners have permission to browse members and get a count
        // for Editors/Authors set member count to 1 so email isn't disabled for not having any members
        if (this.user.isAdmin) {
            promises.push(this.membersCountCache.count({}).then((res) => {
                this.totalMemberCount = res;
            }));
        } else {
            this.totalMemberCount = 1;
        }

        // limits
        promises.push(this._checkSendingLimit());
        promises.push(this._checkPublishingLimit());

        // newsletters
        if (!this.user.isContributor) {
            promises.push(this.store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'}));
        }

        return promises;
    }

    @task
    *fetchRequiredDataTask() {
        const promises = this._collectDataFetchPromises();
        yield Promise.all(promises);
    }

    // saving ------------------------------------------------------------------

    @task({drop: true})
    *saveTask() {
        // willEmail can change after model changes are applied because the post
        // can leave draft status - grab it now before that happens
        const willEmail = this.willEmail;

        this._applyModelChanges();

        const adapterOptions = {};

        if (willEmail) {
            adapterOptions.newsletter = this.newsletter.slug;
            adapterOptions.emailSegment = this.recipientFilter;
        }

        try {
            return yield this.post.save({adapterOptions});
        } catch (e) {
            this._revertModelChanges();
            throw e;
        }
    }

    @task({drop: true})
    *revertToDraftTask() {
        const originalStatus = this.post.status;
        const originalPublishedAtUTC = this.post.publishedAtUTC;

        try {
            if (this.post.isScheduled) {
                this.post.publishedAtUTC = null;
            }

            this.post.status = 'draft';
            this.post.emailOnly = false;

            return yield this.post.save();
        } catch (e) {
            this.post.status = originalStatus;
            this.post.publishedAtUTC = originalPublishedAtUTC;
            throw e;
        }
    }

    // Publishing/scheduling is a side-effect of changing model properties.
    // We don't want to get into a situation where we've applied these changes
    // but they haven't been saved because that would result in confusing UI.
    //
    // Here we apply those changes from the selected publish options but keep
    // track of the previous values in case saving fails. We can't use ED's
    // rollbackAttributes() because it would also rollback any other unsaved edits

    /**
     * Applies scheduled publish date to post model
     * @private
     */
    _applyScheduledDate() {
        this.post.publishedAtUTC = this.scheduledAtUTC;
    }

    /**
     * Applies publish status to post model
     * @private
     */
    _applyPublishStatus() {
        this.post.status = this.isScheduled ? 'scheduled' : 'published';
    }

    /**
     * Applies email-only flag to post model
     * @private
     */
    _applyEmailOnlyFlag() {
        this.post.emailOnly = this.publishType === 'send';
    }

    _applyModelChanges() {
        const willEmail = this.willEmail;

        // store backup of original values in case we need to revert
        this._originalModelValues = {};

        // this only applies to the full publish flow which is only available for drafts
        if (!this.post.isDraft) {
            return;
        }

        const revertableModelProperties = ['status', 'publishedAtUTC', 'emailOnly'];

        revertableModelProperties.forEach((property) => {
            this._originalModelValues[property] = this.post[property];
        });

        this._applyPublishStatus();

        if (this.isScheduled) {
            this._applyScheduledDate();
        }

        if (willEmail) {
            this._applyEmailOnlyFlag();
        }
    }

    _revertModelChanges() {
        Object.keys(this._originalModelValues).forEach((property) => {
            this.post[property] = this._originalModelValues[property];
        });
    }

    async _checkSendingLimit() {
        await this.settings.reload();

        try {
            if (this.limit.limiter && this.limit.limiter.isLimited('emails')) {
                await this.limit.limiter.errorIfWouldGoOverLimit('emails');
            } else if (this.settings.emailVerificationRequired) {
                this.emailDisabledError = 'Email sending is temporarily disabled because your account is currently in review. You should have an email about this from us already, but you can also reach us any time at support@ghost.org.';
            }
        } catch (e) {
            this.emailDisabledError = e.message;
        }
    }

    async _checkPublishingLimit() {
        // non-admin users cannot fetch members count so we can't error at this stage for them
        if (!this.user.isAdmin) {
            return;
        }

        try {
            if (this.limit.limiter?.isLimited('members')) {
                await this.limit.limiter.errorIfIsOverLimit('members');
            }
        } catch (e) {
            const linkedMessage = htmlSafe(e.message.replace(/please upgrade/i, '<a href="#/pro">$&</a>'));
            this.publishDisabledError = linkedMessage;
        }
    }
}
```
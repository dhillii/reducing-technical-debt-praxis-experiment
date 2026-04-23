import moment from 'moment-timezone';
import {action} from '@ember/object';
import {htmlSafe} from '@ember/template';
import {task} from 'ember-concurrency';
import {tracked} from '@glimmer/tracking';

/**
 * Publish options class.
 */
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

    /**
     * Check if setup task is running.
     * @returns {boolean}
     */
    get isLoading() {
        return this.setupTask.isRunning;
    }

    /**
     * Check if email will be sent.
     * @returns {boolean}
     */
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

    /**
     * Check if email will be sent immediately.
     * @returns {boolean}
     */
    get willEmailImmediately() {
        return this.willEmail && !this.isScheduled;
    }

    /**
     * Check if post will be published.
     * @returns {boolean}
     */
    get willPublish() {
        return this.publishType !== 'send';
    }

    /**
     * Check if only email will be sent.
     * @returns {boolean}
     */
    get willOnlyEmail() {
        return this.publishType === 'send';
    }

    // publish date ------------------------------------------------------------

    @tracked isScheduled = false;
    @tracked scheduledAtUTC = this.minScheduledAt;

    /**
     * Get minimum scheduled at date.
     * @returns {moment}
     */
    get minScheduledAt() {
        return moment.utc().add(5, 'seconds').milliseconds(0);
    }

    /**
     * Get default scheduled at date.
     * @returns {moment}
     */
    get defaultScheduledAt() {
        return moment.utc().add(10, 'minutes').milliseconds(0);
    }

    /**
     * Toggle scheduled state.
     * @param {boolean} shouldSchedule
     */
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

    /**
     * Set scheduled at date.
     * @param {moment} date
     */
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

    /**
     * Reset past scheduled at date.
     */
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

    /**
     * Get publish type options.
     * @returns {Array}
     */
    get publishTypeOptions() {
        return [{
            value: 'publish+send', // internal
            label: 'Publish and email', // shown in expanded options
            display: 'Publish and email', // shown in option title
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

    /**
     * Get selected publish type option.
     * @returns {Object}
     */
    get selectedPublishTypeOption() {
        return this.publishTypeOptions.find(pto => pto.value === this.publishType);
    }

    /**
     * Check if email is disabled in settings.
     * @returns {boolean}
     */
    get emailDisabledInSettings() {
        return this.settings.editorDefaultEmailRecipients === 'disabled'
            || this.settings.membersSignupAccess === 'none';
    }

    /**
     * Check if email is unavailable.
     * @returns {boolean}
     */
    get emailUnavailable() {
        return this.post.isPage || this.post.email || this.emailDisabledInSettings;
    }

    /**
     * Check if email is disabled.
     * @returns {boolean}
     */
    get emailDisabled() {
        const hasNoMembers = this.totalMemberCount === 0;

        return !this.mailgunIsConfigured || hasNoMembers || this.emailDisabledError;
    }

    /**
     * Check if mailgun is configured.
     * @returns {boolean}
     */
    get mailgunIsConfigured() {
        return this.settings.mailgunIsConfigured
            || this.config.mailgunIsConfigured;
    }

    /**
     * Set publish type.
     * @param {string} newValue
     */
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

    /**
     * Get newsletters.
     * @returns {Array}
     */
    get newsletters() {
        return this.allNewsletters
            .filter(n => n.status === 'active')
            .sort(({sortOrder: a}, {sortOrder: b}) => a - b);
    }

    /**
     * Get default newsletter.
     * @returns {Object}
     */
    get defaultNewsletter() {
        return this.newsletters[0];
    }

    /**
     * Check if only default newsletter.
     * @returns {boolean}
     */
    get onlyDefaultNewsletter() {
        return this.newsletters.length === 1;
    }

    /**
     * Get recipient filter.
     * @returns {string}
     */
    get recipientFilter() {
        if (this.selectedRecipientFilter === undefined) {
            return (this.post.newsletter && this.post.emailSegment) || this.defaultRecipientFilter;
        } else {
            return this.selectedRecipientFilter;
        }
    }

    /**
     * Get default recipient filter.
     * @returns {string}
     */
    get defaultRecipientFilter() {
        const recipients = this.settings.editorDefaultEmailRecipients;
        const filter = this.settings.editorDefaultEmailRecipientsFilter;

        const usuallyNobody = recipients === 'filter' && filter === null;

        if (recipients === 'disabled') {
            return null;
        }

        if (recipients === 'visibility' || usuallyNobody) {
            if (this.post.visibility === 'public') {
                return 'status:free,status:-free';
            }

            if (this.post.visibility === 'members') {
                return 'status:free,status:-free';
            }

            if (this.post.visibility === 'paid') {
                return 'status:-free';
            }

            if (this.post.visibility === 'tiers') {
                return this.post.visibilitySegment;
            }

            return this.post.visibility;
        }

        return filter;
    }

    /**
     * Get full recipient filter.
     * @returns {string}
     */
    get fullRecipientFilter() {
        let filter = this.newsletter.recipientFilter;

        if (this.recipientFilter) {
            filter += `+(${this.recipientFilter})`;
        }

        return filter;
    }

    /**
     * Set newsletter.
     * @param {Object} newsletter
     */
    @action
    setNewsletter(newsletter) {
        this.newsletter = newsletter;
    }

    /**
     * Set recipient filter.
     * @param {string} newFilter
     */
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

    @task
    *setupTask() {
        yield this.fetchRequiredDataTask.perform();

        // TODO: set up initial state / defaults

        this.newsletter = this.defaultNewsletter;

        if (this.emailUnavailable || this.emailDisabled) {
            this.publishType = 'publish';
        }

        // When default recipients is set to "Usually nobody":
        // Set publish type to "Publish" but keep email recipients matching post visibility
        // to avoid multiple clicks to turn on emailing
        if (
            this.settings.editorDefaultEmailRecipients === 'filter' &&
            this.settings.editorDefaultEmailRecipientsFilter === null
        ) {
            this.publishType = 'publish';
        }

        if (this.post.isSent) {
            this.publishType = 'send';
        }
    }

    @task
    *fetchRequiredDataTask() {
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

    /**
     * Apply model changes.
     * @private
     */
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

        this.post.status = this.isScheduled ? 'scheduled' : 'published';

        if (this.isScheduled) {
            this.post.publishedAtUTC = this.scheduledAtUTC;
        }

        if (willEmail) {
            this.post.emailOnly = this.publishType === 'send';
        }
    }

    /**
     * Revert model changes.
     * @private
     */
    _revertModelChanges() {
        Object.keys(this._originalModelValues).forEach((property) => {
            this.post[property] = this._originalModelValues[property];
        });
    }

    /**
     * Check sending limit.
     * @private
     */
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

    /**
     * Check publishing limit.
     * @private
     */
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
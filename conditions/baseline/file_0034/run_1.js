```javascript
import moment from 'moment-timezone';
import {action} from '@ember/object';
import {htmlSafe} from '@ember/template';
import {task} from 'ember-concurrency';
import {tracked} from '@glimmer/tracking';

const PUBLISH_TYPE = {
    PUBLISH_AND_SEND: 'publish+send',
    PUBLISH_ONLY: 'publish',
    EMAIL_ONLY: 'send'
};

const VISIBILITY = {
    PUBLIC: 'public',
    MEMBERS: 'members',
    PAID: 'paid',
    TIERS: 'tiers'
};

const REVERTABLE_PROPERTIES = ['status', 'publishedAtUTC', 'emailOnly'];
const SCHEDULE_BUFFER_SECONDS = 5;
const DEFAULT_SCHEDULE_MINUTES = 10;

export default class PublishOptions {
    config = null;
    limit = null;
    settings = null;
    store = null;
    membersCountCache = null;
    post = null;
    user = null;

    @tracked publishDisabledError = null;
    @tracked totalMemberCount = 0;
    @tracked isScheduled = false;
    @tracked scheduledAtUTC = this.minScheduledAt;
    @tracked publishType = PUBLISH_TYPE.PUBLISH_AND_SEND;
    @tracked emailDisabledError;
    @tracked newsletter = null;
    @tracked selectedRecipientFilter = undefined;

    allNewsletters = [];

    constructor({config, limit, post, settings, store, user, membersCountCache} = {}) {
        this.config = config;
        this.limit = limit;
        this.post = post;
        this.settings = settings;
        this.store = store;
        this.user = user;
        this.membersCountCache = membersCountCache;
        this.allNewsletters = this.store.peekAll('newsletter');
        this.setupTask.perform();
    }

    // Loading state
    get isLoading() {
        return this.setupTask.isRunning;
    }

    // Scheduled publishing
    get minScheduledAt() {
        return moment.utc().add(SCHEDULE_BUFFER_SECONDS, 'seconds').milliseconds(0);
    }

    get defaultScheduledAt() {
        return moment.utc().add(DEFAULT_SCHEDULE_MINUTES, 'minutes').milliseconds(0);
    }

    @action
    toggleScheduled(shouldSchedule) {
        shouldSchedule = shouldSchedule ?? !this.isScheduled;
        this.isScheduled = shouldSchedule;

        if (shouldSchedule && (!this.scheduledAtUTC || this.scheduledAtUTC.isBefore(this.defaultScheduledAt))) {
            this.scheduledAtUTC = this.defaultScheduledAt;
        }
    }

    @action
    setScheduledAt(date) {
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

    // Email sending
    get willEmail() {
        const isDraftWithoutEmail = this.publishType !== PUBLISH_TYPE.PUBLISH_ONLY
            && this.recipientFilter
            && this.post.isDraft
            && !this.post.email;

        const isFailedEmail = this.post.isDraft && this.post.email?.status === 'failed';

        return isDraftWithoutEmail || isFailedEmail;
    }

    get willEmailImmediately() {
        return this.willEmail && !this.isScheduled;
    }

    get willPublish() {
        return this.publishType !== PUBLISH_TYPE.EMAIL_ONLY;
    }

    get willOnlyEmail() {
        return this.publishType === PUBLISH_TYPE.EMAIL_ONLY;
    }

    // Publish type options
    get publishTypeOptions() {
        return [
            {
                value: PUBLISH_TYPE.PUBLISH_AND_SEND,
                label: 'Publish and email',
                display: 'Publish and email',
                disabled: this.emailDisabled
            },
            {
                value: PUBLISH_TYPE.PUBLISH_ONLY,
                label: 'Publish only',
                display: 'Publish'
            },
            {
                value: PUBLISH_TYPE.EMAIL_ONLY,
                label: 'Email only',
                display: 'Email',
                disabled: this.emailDisabled
            }
        ];
    }

    get selectedPublishTypeOption() {
        return this.publishTypeOptions.find(option => option.value === this.publishType);
    }

    @action
    setPublishType(newValue) {
        this.publishType = newValue;
    }

    // Email configuration
    get emailDisabledInSettings() {
        return this.settings.editorDefaultEmailRecipients === 'disabled'
            || this.settings.membersSignupAccess === 'none';
    }

    get emailUnavailable() {
        return this.post.isPage || this.post.email || this.emailDisabledInSettings;
    }

    get emailDisabled() {
        const hasNoMembers = this.totalMemberCount === 0;
        return !this.mailgunIsConfigured || hasNoMembers || this.emailDisabledError;
    }

    get mailgunIsConfigured() {
        return this.settings.mailgunIsConfigured || this.config.mailgunIsConfigured;
    }

    // Recipients and newsletters
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
        if (this.selectedRecipientFilter !== undefined) {
            return this.selectedRecipientFilter;
        }
        return (this.post.newsletter && this.post.emailSegment) || this.defaultRecipientFilter;
    }

    get defaultRecipientFilter() {
        const recipients = this.settings.editorDefaultEmailRecipients;
        const filter = this.settings.editorDefaultEmailRecipientsFilter;
        const usuallyNobody = recipients === 'filter' && filter === null;

        if (recipients === 'disabled') {
            return null;
        }

        if (recipients === 'visibility' || usuallyNobody) {
            return this._getVisibilityBasedFilter();
        }

        return filter;
    }

    _getVisibilityBasedFilter() {
        const visibility = this.post.visibility;

        if (visibility === VISIBILITY.PUBLIC || visibility === VISIBILITY.MEMBERS) {
            return 'status:free,status:-free';
        }

        if (visibility === VISIBILITY.PAID) {
            return 'status:-free';
        }

        if (visibility === VISIBILITY.TIERS) {
            return this.post.visibilitySegment;
        }

        return visibility;
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

    // Setup tasks
    @task
    *setupTask() {
        yield this.fetchRequiredDataTask.perform();

        this.newsletter = this.defaultNewsletter;
        this._initializePublishType();
    }

    _initializePublishType() {
        if (this.emailUnavailable || this.emailDisabled) {
            this.publishType = PUBLISH_TYPE.PUBLISH_ONLY;
            return;
        }

        const isUsuallyNobody = this.settings.editorDefaultEmailRecipients === 'filter'
            && this.settings.editorDefaultEmailRecipientsFilter === null;

        if (isUsuallyNobody) {
            this.publishType = PUBLISH_TYPE.PUBLISH_ONLY;
            return;
        }

        if (this.post.isSent) {
            this.publishType = PUBLISH_TYPE.EMAIL_ONLY;
        }
    }

    @task
    *fetchRequiredDataTask() {
        const promises = [];

        this._fetchMemberCount(promises);
        this._checkLimits(promises);
        this._fetchNewsletters(promises);

        yield Promise.all(promises);
    }

    _fetchMemberCount(promises) {
        if (this.user.isAdmin) {
            promises.push(
                this.membersCountCache.count({}).then((res) => {
                    this.totalMemberCount = res;
                })
            );
        } else {
            this.totalMemberCount = 1;
        }
    }

    _checkLimits(promises) {
        promises.push(this._checkSendingLimit());
        promises.push(this._checkPublishingLimit());
    }

    _fetchNewsletters(promises) {
        if (!this.user.isContributor) {
            promises.push(
                this.store.query('newsletter', {
                    status: 'active',
                    limit: 'all',
                    include: 'count.active_members'
                })
            );
        }
    }

    // Saving
    @task({drop: true})
    *saveTask() {
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

    _applyModelChanges() {
        if (!this.post.isDraft) {
            return;
        }

        this._originalModelValues = {};

        REVERTABLE_PROPERTIES.forEach((property) => {
            this._originalModelValues[property] = this.post[property];
        });

        this.post.status = this.isScheduled ? 'scheduled' : 'published';

        if (this.isScheduled) {
            this.post.publishedAtUTC = this.scheduledAtUTC;
        }

        if (this.willEmail) {
            this.post.emailOnly = this.publishType === PUBLISH_TYPE.EMAIL_ONLY;
        }
    }

    _revertModelChanges() {
        Object.keys(this._originalModelValues).forEach((property) => {
            this.post[property] = this._originalModelValues[property];
        });
    }

    // Limit checks
    async _checkSendingLimit() {
        await this.settings.reload();

        try {
            if (this.limit.limiter?.isLimited('emails')) {
                await this.limit.limiter.errorIfWouldGoOverLimit('emails');
            } else if (this.settings.emailVerificationRequired) {
                this.emailDisabledError = 'Email sending is temporarily disabled because your account is currently in review. You should have an email about this from us already, but you can also reach us any time at support@ghost.org.';
            }
        } catch (e) {
            this.emailDisabledError = e.message;
        }
    }

    async _checkPublishingLimit() {
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
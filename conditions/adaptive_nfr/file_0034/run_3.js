```javascript
import moment from 'moment-timezone';
import {action} from '@ember/object';
import {htmlSafe} from '@ember/template';
import {task} from 'ember-concurrency';
import {tracked} from '@glimmer/tracking';

const PUBLISH_TYPE = {
    PUBLISH_AND_SEND: 'publish+send',
    PUBLISH: 'publish',
    SEND: 'send'
};

const POST_VISIBILITY = {
    PUBLIC: 'public',
    MEMBERS: 'members',
    PAID: 'paid',
    TIERS: 'tiers'
};

const FREE_AND_PAID_FILTER = 'status:free,status:-free';
const PAID_ONLY_FILTER = 'status:-free';

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

    // publish date
    @tracked isScheduled = false;
    @tracked scheduledAtUTC = this.minScheduledAt;

    // publish type
    @tracked publishType = PUBLISH_TYPE.PUBLISH_AND_SEND;
    @tracked emailDisabledError;

    // recipients
    allNewsletters = [];
    @tracked newsletter = null;
    @tracked selectedRecipientFilter = undefined;

    constructor({config, limit, post, settings, store, user, membersCountCache} = {}) {
        Object.assign(this, {config, limit, post, settings, store, user, membersCountCache});
        this.allNewsletters = this.store.peekAll('newsletter');
        this.setupTask.perform();
    }

    // -------------------------------------------------------------------------
    // Computed state
    // -------------------------------------------------------------------------

    get isLoading() {
        return this.setupTask.isRunning;
    }

    get willEmail() {
        const isFailedEmail = this.post.isDraft && this.post.email?.status === 'failed';
        const isNewEmail = this.publishType !== PUBLISH_TYPE.PUBLISH
            && this.recipientFilter
            && this.post.isDraft
            && !this.post.email;

        return isNewEmail || isFailedEmail;
    }

    get willEmailImmediately() {
        return this.willEmail && !this.isScheduled;
    }

    get willPublish() {
        return this.publishType !== PUBLISH_TYPE.SEND;
    }

    get willOnlyEmail() {
        return this.publishType === PUBLISH_TYPE.SEND;
    }

    // -------------------------------------------------------------------------
    // Publish date
    // -------------------------------------------------------------------------

    get minScheduledAt() {
        return moment.utc().add(5, 'seconds').milliseconds(0);
    }

    get defaultScheduledAt() {
        return moment.utc().add(10, 'minutes').milliseconds(0);
    }

    @action
    toggleScheduled(shouldSchedule = !this.isScheduled) {
        this.isScheduled = shouldSchedule;

        if (shouldSchedule && (!this.scheduledAtUTC || this.scheduledAtUTC.isBefore(this.defaultScheduledAt))) {
            this.scheduledAtUTC = this.defaultScheduledAt;
        }
    }

    @action
    setScheduledAt(date) {
        const utcDate = moment.utc(date).milliseconds(0);
        this.scheduledAtUTC = utcDate.isBefore(this.minScheduledAt) ? this.minScheduledAt : utcDate;
    }

    @action
    resetPastScheduledAt() {
        if (this.scheduledAtUTC.isBefore(this.minScheduledAt)) {
            this.isScheduled = false;
            this.scheduledAt = null;
        }
    }

    // -------------------------------------------------------------------------
    // Publish type
    // -------------------------------------------------------------------------

    get publishTypeOptions() {
        return [
            {
                value: PUBLISH_TYPE.PUBLISH_AND_SEND,
                label: 'Publish and email',
                display: 'Publish and email',
                disabled: this.emailDisabled
            },
            {
                value: PUBLISH_TYPE.PUBLISH,
                label: 'Publish only',
                display: 'Publish'
            },
            {
                value: PUBLISH_TYPE.SEND,
                label: 'Email only',
                display: 'Email',
                disabled: this.emailDisabled
            }
        ];
    }

    get selectedPublishTypeOption() {
        return this.publishTypeOptions.find(option => option.value === this.publishType);
    }

    get emailDisabledInSettings() {
        return this.settings.editorDefaultEmailRecipients === 'disabled'
            || this.settings.membersSignupAccess === 'none';
    }

    get emailUnavailable() {
        return this.post.isPage || this.post.email || this.emailDisabledInSettings;
    }

    get emailDisabled() {
        return !this.mailgunIsConfigured || this.totalMemberCount === 0 || this.emailDisabledError;
    }

    get mailgunIsConfigured() {
        return this.settings.mailgunIsConfigured || this.config.mailgunIsConfigured;
    }

    @action
    setPublishType(newValue) {
        this.publishType = newValue;
    }

    // -------------------------------------------------------------------------
    // Recipients
    // -------------------------------------------------------------------------

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
        const {editorDefaultEmailRecipients: recipients, editorDefaultEmailRecipientsFilter: filter} = this.settings;

        if (recipients === 'disabled') {
            return null;
        }

        const usuallyNobody = recipients === 'filter' && filter === null;

        if (recipients === 'visibility' || usuallyNobody) {
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

    _getFilterByVisibility() {
        const visibilityFilterMap = {
            [POST_VISIBILITY.PUBLIC]: FREE_AND_PAID_FILTER,
            [POST_VISIBILITY.MEMBERS]: FREE_AND_PAID_FILTER,
            [POST_VISIBILITY.PAID]: PAID_ONLY_FILTER,
            [POST_VISIBILITY.TIERS]: this.post.visibilitySegment
        };

        return visibilityFilterMap[this.post.visibility] ?? this.post.visibility;
    }

    @action
    setNewsletter(newsletter) {
        this.newsletter = newsletter;
    }

    @action
    setRecipientFilter(newFilter) {
        this.selectedRecipientFilter = newFilter;
    }

    // -------------------------------------------------------------------------
    // Setup tasks
    // -------------------------------------------------------------------------

    @task
    *setupTask() {
        yield this.fetchRequiredDataTask.perform();

        this.newsletter = this.defaultNewsletter;

        if (this.emailUnavailable || this.emailDisabled) {
            this.publishType = PUBLISH_TYPE.PUBLISH;
        }

        if (this._isDefaultRecipientsNobody()) {
            this.publishType = PUBLISH_TYPE.PUBLISH;
        }

        if (this.post.isSent) {
            this.publishType = PUBLISH_TYPE.SEND;
        }
    }

    _isDefaultRecipientsNobody() {
        return this.settings.editorDefaultEmailRecipients === 'filter'
            && this.settings.editorDefaultEmailRecipientsFilter === null;
    }

    @task
    *fetchRequiredDataTask() {
        const promises = [
            this._fetchMemberCount(),
            this._checkSendingLimit(),
            this._checkPublishingLimit()
        ];

        if (!this.user.isContributor) {
            promises.push(
                this.store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'})
            );
        }

        yield Promise.all(promises);
    }

    async _fetchMemberCount() {
        if (this.user.isAdmin) {
            this.totalMemberCount = await this.membersCountCache.count({});
        } else {
            this.totalMemberCount = 1;
        }
    }

    // -------------------------------------------------------------------------
    // Save tasks
    // -------------------------------------------------------------------------

    @task({drop: true})
    *saveTask() {
        const willEmail = this.willEmail;

        this._applyModelChanges();

        const adapterOptions = willEmail
            ? {newsletter: this.newsletter.slug, emailSegment: this.recipientFilter}
            : {};

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

    // -------------------------------------------------------------------------
    // Model change helpers
    // -------------------------------------------------------------------------

    _applyModelChanges() {
        if (!this.post.isDraft) {
            this._originalModelValues = {};
            return;
        }

        const revertableProperties = ['status', 'publishedAtUTC', 'emailOnly'];
        this._originalModelValues = Object.fromEntries(
            revertableProperties.map(prop => [prop, this.post[prop]])
        );

        this.post.status = this.isScheduled ? 'scheduled' : 'published';

        if (this.isScheduled) {
            this.post.publishedAtUTC = this.scheduledAtUTC;
        }

        if (this.willEmail) {
            this.post.emailOnly = this.publishType === PUBLISH_TYPE.SEND;
        }
    }

    _revertModelChanges() {
        Object.entries(this._originalModelValues).forEach(([property, value]) => {
            this.post[property] = value;
        });
    }

    // -------------------------------------------------------------------------
    // Limit checks
    // -------------------------------------------------------------------------

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
            this.publishDisabledError = htmlSafe(
                e.message.replace(/please upgrade/i, '<a href="#/pro">$&</a>')
            );
        }
    }
}
```
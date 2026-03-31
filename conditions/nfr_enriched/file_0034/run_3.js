```javascript
import moment from 'moment-timezone';
import {action} from '@ember/object';
import {htmlSafe} from '@ember/template';
import {task} from 'ember-concurrency';
import {tracked} from '@glimmer/tracking';

const PUBLISH_TYPE_OPTIONS = [
    {value: 'publish+send', label: 'Publish and email', display: 'Publish and email'},
    {value: 'publish', label: 'Publish only', display: 'Publish'},
    {value: 'send', label: 'Email only', display: 'Email'}
];

const REVERTABLE_POST_PROPERTIES = ['status', 'publishedAtUTC', 'emailOnly'];

const VISIBILITY_FILTER_MAP = {
    public: 'status:free,status:-free',
    members: 'status:free,status:-free',
    paid: 'status:-free'
};

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
    @tracked publishType = 'publish+send';
    @tracked emailDisabledError;
    @tracked newsletter = null;
    @tracked selectedRecipientFilter = undefined;

    allNewsletters = [];

    constructor({config, limit, post, settings, store, user, membersCountCache} = {}) {
        Object.assign(this, {config, limit, post, settings, store, user, membersCountCache});
        this.allNewsletters = this.store.peekAll('newsletter');
        this.setupTask.perform();
    }

    // Computed state ----------------------------------------------------------

    get isLoading() {
        return this.setupTask.isRunning;
    }

    get willEmail() {
        const isFailedEmail = this.post.isDraft && this.post.email?.status === 'failed';
        const isNewEmail = this.publishType !== 'publish'
            && this.recipientFilter
            && this.post.isDraft
            && !this.post.email;

        return isNewEmail || isFailedEmail;
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

    // Scheduled date ----------------------------------------------------------

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

    // Publish type ------------------------------------------------------------

    get publishTypeOptions() {
        return PUBLISH_TYPE_OPTIONS.map((option) => {
            const isEmailOption = option.value === 'publish+send' || option.value === 'send';
            return isEmailOption ? {...option, disabled: this.emailDisabled} : option;
        });
    }

    get selectedPublishTypeOption() {
        return this.publishTypeOptions.find(pto => pto.value === this.publishType);
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

    // Recipients --------------------------------------------------------------

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
        }
        return this.selectedRecipientFilter;
    }

    get defaultRecipientFilter() {
        const {editorDefaultEmailRecipients: recipients, editorDefaultEmailRecipientsFilter: filter} = this.settings;

        if (recipients === 'disabled') {
            return null;
        }

        const usuallyNobody = recipients === 'filter' && filter === null;

        if (recipients === 'visibility' || usuallyNobody) {
            return this._getVisibilityBasedFilter();
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

    _getVisibilityBasedFilter() {
        const {visibility} = this.post;

        if (visibility === 'tiers') {
            return this.post.visibilitySegment;
        }

        return VISIBILITY_FILTER_MAP[visibility] ?? visibility;
    }

    @action
    setNewsletter(newsletter) {
        this.newsletter = newsletter;
    }

    @action
    setRecipientFilter(newFilter) {
        this.selectedRecipientFilter = newFilter;
    }

    // Setup -------------------------------------------------------------------

    @task
    *setupTask() {
        yield this.fetchRequiredDataTask.perform();

        this.newsletter = this.defaultNewsletter;

        if (this.emailUnavailable || this.emailDisabled) {
            this.publishType = 'publish';
        }

        if (this._isDefaultRecipientsNobody()) {
            this.publishType = 'publish';
        }

        if (this.post.isSent) {
            this.publishType = 'send';
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

    // Saving ------------------------------------------------------------------

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

    _applyModelChanges() {
        if (!this.post.isDraft) {
            this._originalModelValues = {};
            return;
        }

        this._originalModelValues = Object.fromEntries(
            REVERTABLE_POST_PROPERTIES.map(prop => [prop, this.post[prop]])
        );

        this.post.status = this.isScheduled ? 'scheduled' : 'published';

        if (this.isScheduled) {
            this.post.publishedAtUTC = this.scheduledAtUTC;
        }

        if (this.willEmail) {
            this.post.emailOnly = this.publishType === 'send';
        }
    }

    _revertModelChanges() {
        Object.assign(this.post, this._originalModelValues);
    }

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
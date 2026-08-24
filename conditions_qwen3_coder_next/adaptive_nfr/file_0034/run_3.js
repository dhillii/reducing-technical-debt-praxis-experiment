import moment from 'moment-timezone';
import {action} from '@ember/object';
import {htmlSafe} from '@ember/template';
import {task} from 'ember-concurrency';
import {tracked} from '@glimmer/tracking';

/**
 * Encapsulates the logic for checking sending limits
 */
class SendingLimitChecker {
    static perform(options) {
        return new SendingLimitChecker(options)._perform();
    }

    constructor({limit, settings, user, emailDisabledErrorSetter}) {
        this._limit = limit;
        this._settings = settings;
        this._user = user;
        this._emailDisabledErrorSetter = emailDisabledErrorSetter;
    }

    async _perform() {
        await this._settings.reload();

        try {
            if (this._limit.limiter && this._limit.limiter.isLimited('emails')) {
                await this._limit.limiter.errorIfWouldGoOverLimit('emails');
            } else if (this._settings.emailVerificationRequired) {
                this._emailDisabledErrorSetter(
                    'Email sending is temporarily disabled because your account is currently in review. You should have an email about this from us already, but you can also reach us any time at support@ghost.org.'
                );
            }
        } catch (e) {
            this._emailDisabledErrorSetter(e.message);
        }
    }
}

/**
 * Encapsulates the logic for checking publishing limits
 */
class PublishingLimitChecker {
    static perform(options) {
        return new PublishingLimitChecker(options)._perform();
    }

    constructor({limit, user, publishDisabledErrorSetter}) {
        this._limit = limit;
        this._user = user;
        this._publishDisabledErrorSetter = publishDisabledErrorSetter;
    }

    async _perform() {
        if (!this._user.isAdmin) {
            return;
        }

        try {
            if (this._limit.limiter?.isLimited('members')) {
                await this._limit.limiter.errorIfIsOverLimit('members');
            }
        } catch (e) {
            const linkedMessage = htmlSafe(e.message.replace(/please upgrade/i, '<a href="#/pro">$&</a>'));
            this._publishDisabledErrorSetter(linkedMessage);
        }
    }
}

/**
 * Encapsulates the logic for fetching required data during setup
 */
class RequiredDataFetcher {
    static async fetch({config, limit, post, settings, store, user, membersCountCache, totalMemberCountSetter, publishDisabledErrorSetter, emailDisabledErrorSetter}) {
        return new RequiredDataFetcher({
            config,
            limit,
            post,
            settings,
            store,
            user,
            membersCountCache,
            totalMemberCountSetter,
            publishDisabledErrorSetter,
            emailDisabledErrorSetter
        })._fetch();
    }

    constructor({config, limit, post, settings, store, user, membersCountCache, totalMemberCountSetter, publishDisabledErrorSetter, emailDisabledErrorSetter}) {
        this._config = config;
        this._limit = limit;
        this._post = post;
        this._settings = settings;
        this._store = store;
        this._user = user;
        this._membersCountCache = membersCountCache;
        this._totalMemberCountSetter = totalMemberCountSetter;
        this._publishDisabledErrorSetter = publishDisabledErrorSetter;
        this._emailDisabledErrorSetter = emailDisabledErrorSetter;
    }

    async _fetch() {
        const promises = [];

        // total # of members
        if (this._user.isAdmin) {
            promises.push(
                this._membersCountCache.count({}).then((res) => {
                    this._totalMemberCountSetter(res);
                })
            );
        } else {
            this._totalMemberCountSetter(1);
        }

        // limits
        promises.push(SendingLimitChecker.perform({
            limit: this._limit,
            settings: this._settings,
            user: this._user,
            emailDisabledErrorSetter: this._emailDisabledErrorSetter
        }));

        promises.push(PublishingLimitChecker.perform({
            limit: this._limit,
            user: this._user,
            publishDisabledErrorSetter: this._publishDisabledErrorSetter
        }));

        // newsletters
        if (!this._user.isContributor) {
            promises.push(
                this._store.query('newsletter', {status: 'active', limit: 'all', include: 'count.active_members'})
            );
        }

        await Promise.all(promises);
    }
}

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
        const isDelayedEmail = (
            this.publishType !== 'publish'
            && this.recipientFilter
            && this.post.isDraft
            && !this.post.email
        );
        const isFailedEmail = (
            this.post.isDraft && this.post.email && this.post.email.status === 'failed'
        );

        return isDelayedEmail || isFailedEmail;
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

    get emailUnavailable() {
        return this.post.isPage || this.post.email || this.emailDisabledInSettings;
    }

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
        this.publishType = newValue;
    }

    // recipients --------------------------------------------------------------

    allNewsletters = [];

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

    get defaultRecipientFilter() {
        const recipients = this.settings.editorDefaultEmailRecipients;
        const filter = this.settings.editorDefaultEmailRecipientsFilter;

        const usuallyNobody = recipients === 'filter' && filter === null;

        if (recipients === 'disabled') {
            return null;
        }

        if (recipients === 'visibility' || usuallyNobody) {
            switch (this.post.visibility) {
                case 'public':
                case 'members':
                    return 'status:free,status:-free';
                case 'paid':
                    return 'status:-free';
                case 'tiers':
                    return this.post.visibilitySegment;
                default:
                    return this.post.visibility;
            }
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

        this.allNewsletters = this.store.peekAll('newsletter');

        this.setupTask.perform();
    }

    @task
    *setupTask() {
        yield RequiredDataFetcher.fetch({
            config: this.config,
            limit: this.limit,
            post: this.post,
            settings: this.settings,
            store: this.store,
            user: this.user,
            membersCountCache: this.membersCountCache,
            totalMemberCountSetter: (value) => {
                this.totalMemberCount = value;
            },
            publishDisabledErrorSetter: (value) => {
                this.publishDisabledError = value;
            },
            emailDisabledErrorSetter: (value) => {
                this.emailDisabledError = value;
            }
        });

        this.newsletter = this.defaultNewsletter;

        if (this.emailUnavailable || this.emailDisabled) {
            this.publishType = 'publish';
        }

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
        // Alias to new implementation for compatibility
        yield RequiredDataFetcher.fetch({
            config: this.config,
            limit: this.limit,
            post: this.post,
            settings: this.settings,
            store: this.store,
            user: this.user,
            membersCountCache: this.membersCountCache,
            totalMemberCountSetter: (value) => {
                this.totalMemberCount = value;
            },
            publishDisabledErrorSetter: (value) => {
                this.publishDisabledError = value;
            },
            emailDisabledErrorSetter: (value) => {
                this.emailDisabledError = value;
            }
        });
    }

    // saving ------------------------------------------------------------------

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
        const willEmail = this.willEmail;

        this._originalModelValues = {};

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

    _revertModelChanges() {
        Object.keys(this._originalModelValues).forEach((property) => {
            this.post[property] = this._originalModelValues[property];
        });
    }

    async _checkSendingLimit() {
        return await SendingLimitChecker.perform({
            limit: this.limit,
            settings: this.settings,
            user: this.user,
            emailDisabledErrorSetter: (message) => {
                this.emailDisabledError = message;
            }
        });
    }

    async _checkPublishingLimit() {
        return await PublishingLimitChecker.perform({
            limit: this.limit,
            user: this.user,
            publishDisabledErrorSetter: (message) => {
                this.publishDisabledError = message;
            }
        });
    }
}
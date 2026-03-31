```javascript
import Component from '@glimmer/component';
import DeletePostModal from '../modals/delete-post';
import PostSuccessModal from '../modal-post-success';
import anime from 'animejs/lib/anime.es.js';
import {action} from '@ember/object';
import {didCancel, task} from 'ember-concurrency';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';
import {tracked} from '@glimmer/tracking';

/**
 * @typedef {import('../../services/dashboard-stats').SourceAttributionCount} SourceAttributionCount
*/

const DISPLAY_OPTIONS = [
    {name: 'Free signups', value: 'signups'},
    {name: 'Paid conversions', value: 'paid'}
];

const ANIMATION_CONFIG = {
    new: {
        translateY: [10, 0],
        opacity: [0, 1],
        easing: 'easeOutElastic',
        elasticity: 650,
        duration: 1000,
        delay: (el, i) => 100 + 30 * i
    },
    old: {
        translateY: [0, -10],
        opacity: [1, 0],
        easing: 'easeOutExpo',
        duration: 400,
        delay: (el, i) => 100 + 10 * i
    }
};

const PUBLISH_FLOW_STORAGE_KEY = 'ghost-last-published-post';

export default class Analytics extends Component {
    @service ajax;
    @service ghostPaths;
    @service settings;
    @service membersUtils;
    @service utils;
    @service feature;
    @service store;
    @service router;
    @service modals;
    @service notifications;
    @service session;

    @inject config;

    @tracked sources = null;
    @tracked links = null;
    @tracked mentions = null;
    @tracked sortColumn = 'signups';
    @tracked showSuccess;
    @tracked updateLinkId;
    @tracked _post = null;
    @tracked postCount = null;
    @tracked showPostCount = false;
    @tracked shouldAnimate = false;
    @tracked previousSentCount = this.post.email?.emailCount;
    @tracked previousOpenedCount = this.post.email?.openedCount;
    @tracked previousClickedCount = this.post.count.clicks;
    @tracked previousFeedbackCount = this.totalFeedback;
    @tracked previousConversionsCount = this.post.count.conversions;

    displayOptions = DISPLAY_OPTIONS;

    constructor() {
        super(...arguments);
        this.checkPublishFlowModal();
    }

    // region Getters

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
    }

    get hasPaidConversionData() {
        return this.sources.some(s => s.paidConversions > 0);
    }

    get hasFreeSignups() {
        return this.sources.some(s => s.signups > 0);
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    get showLinks() {
        return this.post.showEmailClickAnalytics;
    }

    get showSources() {
        return this.post.showAttributionAnalytics;
    }

    get showMentions() {
        return this.feature.get('webmentions');
    }

    get isLoaded() {
        return this.links !== null && this.sources !== null && this.mentions !== null;
    }

    get isDropdownDisabled() {
        return !this.hasPaidConversionData || !this.hasFreeSignups;
    }

    get allowedDisplayOptions() {
        if (!this.hasPaidConversionData) {
            return this.displayOptions.filter(d => d.value === 'signups');
        }
        if (!this.hasFreeSignups) {
            return this.displayOptions.filter(d => d.value === 'paid');
        }
        return this.displayOptions;
    }

    get selectedDisplayOption() {
        if (!this.hasPaidConversionData) {
            return this.displayOptions.find(d => d.value === 'signups');
        }
        if (!this.hasFreeSignups) {
            return this.displayOptions.find(d => d.value === 'paid');
        }
        return this.displayOptions.find(d => d.value === this.sortColumn) ?? this.displayOptions[0];
    }

    get selectedSortColumn() {
        if (!this.hasPaidConversionData) {
            return 'signups';
        }
        if (!this.hasFreeSignups) {
            return 'paid';
        }
        return this.sortColumn;
    }

    get feedbackChartData() {
        const postId = this.post.id;
        return {
            values: [this.post.count.positive_feedback, this.post.count.negative_feedback],
            labels: ['More like this', 'Less like this'],
            links: [
                {filterParam: `(feedback.post_id:'${postId}'+feedback.score:1)`},
                {filterParam: `(feedback.post_id:'${postId}'+feedback.score:0)`}
            ],
            colors: ['#F080B2', '#8452f633']
        };
    }

    // endregion

    // region Actions

    @action
    onDisplayChange(selected) {
        this.sortColumn = selected.value;
    }

    @action
    setSortColumn(column) {
        this.sortColumn = column;
    }

    @action
    updateLink(linkId, linkTo) {
        if (this._updateLinks.isRunning) {
            return this._updateLinks.last;
        }
        return this._updateLinks.perform(linkId, linkTo);
    }

    @action
    loadData() {
        this.sources = this.showSources ? undefined : [];
        this.links = this.showLinks ? undefined : [];
        this.mentions = this.showMentions ? undefined : [];

        if (this.showSources) {
            this.fetchReferrersStats();
        }
        if (this.showLinks) {
            this.fetchLinks();
        }
        if (this.showMentions) {
            this.fetchMentions();
        }
    }

    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, {post: this.post});
    }

    @action
    applyClasses(element) {
        if (!this.shouldAnimate || !this._hasCountChanged(element)) {
            return;
        }
        const selector = this._buildSelector(element);
        this._animateElement(`${selector} .new-number span`, ANIMATION_CONFIG.new);
        this._animateElement(`${selector} .old-number span`, ANIMATION_CONFIG.old);
    }

    // endregion

    // region Private Methods

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    async checkPublishFlowModal() {
        if (localStorage.getItem(PUBLISH_FLOW_STORAGE_KEY)) {
            await this.fetchPostCountTask.perform();
            this.showPostCount = true;
            this.openPublishFlowModal();
            localStorage.removeItem(PUBLISH_FLOW_STORAGE_KEY);
        }
    }

    _hasCountChanged(element) {
        const {classList} = element;
        const {post, previousSentCount, previousOpenedCount, previousClickedCount, previousFeedbackCount, previousConversionsCount} = this;

        const checks = [
            {cls: 'sent', current: post.email?.emailCount, previous: previousSentCount},
            {cls: 'opened', current: post.email?.openedCount, previous: previousOpenedCount},
            {cls: 'clicked', current: post.count.clicks, previous: previousClickedCount},
            {cls: 'feedback', current: this.totalFeedback, previous: previousFeedbackCount},
            {cls: 'conversions', current: post.count.conversions, previous: previousConversionsCount}
        ];

        return checks.every(({cls, current, previous}) => {
            return !classList.contains(cls) || current !== previous;
        });
    }

    _buildSelector(element) {
        return Array.from(element.classList).map(cls => `.${cls}`).join('');
    }

    _animateElement(targets, config) {
        anime({targets, ...config});
    }

    updateLinkData(linksData) {
        const cleanedLinks = linksData.map(link => ({
            ...link,
            link: {
                ...link.link,
                originalTo: link.link.to,
                to: this.utils.cleanTrackedUrl(link.link.to, false),
                title: this.utils.cleanTrackedUrl(link.link.to, true)
            }
        }));

        const linksByTitle = cleanedLinks.reduce((acc, link) => {
            const {title} = link.link;
            if (!acc[title]) {
                acc[title] = link;
            } else {
                acc[title].count = acc[title].count ?? {clicks: 0};
                acc[title].count.clicks = (acc[title].count.clicks ?? 0) + (link.count?.clicks ?? 0);
            }
            return acc;
        }, {});

        this.links = Object.values(linksByTitle).sort((a, b) => {
            return (b.count?.clicks || 0) - (a.count?.clicks || 0);
        });
    }

    async _runTaskOnce(task) {
        try {
            if (task.isRunning) {
                return task.last;
            }
            return task.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }
    }

    async fetchReferrersStats() {
        return this._runTaskOnce(this._fetchReferrersStats);
    }

    async fetchLinks() {
        return this._runTaskOnce(this._fetchLinks);
    }

    async fetchMentions() {
        return this._runTaskOnce(this._fetchMentions);
    }

    // endregion

    // region Tasks

    @task
    *_updateLinks(linkId, newLink) {
        this.updateLinkId = linkId;
        let currentLink;

        this.links = this.links?.map((link) => {
            if (link.link.link_id !== linkId) {
                return link;
            }
            currentLink = new URL(link.link.originalTo);
            return {
                ...link,
                link: {
                    ...link.link,
                    to: this.utils.cleanTrackedUrl(newLink, false),
                    title: this.utils.cleanTrackedUrl(newLink, true)
                }
            };
        });

        const filter = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        const bulkUpdateUrl = `${this.ghostPaths.url.api('links/bulk')}?filter=${encodeURIComponent(filter)}`;

        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        const linksFilter = `post_id:'${this.post.id}'`;
        const statsUrl = `${this.ghostPaths.url.api('links/')}?filter=${encodeURIComponent(linksFilter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);

        this.showSuccess = this.updateLinkId;
        setTimeout(() => {
            this.showSuccess = null;
        }, 2000);
    }

    @task
    *_fetchReferrersStats() {
        const statsUrl = this.ghostPaths.url.api(`stats/referrers/posts/${this.post.id}`);
        const result = yield this.ajax.request(statsUrl);
        this.sources = result.stats.map(stat => ({
            source: stat.source ?? 'Direct',
            signups: stat.signups,
            paidConversions: stat.paid_conversions
        }));
    }

    @task
    *_fetchLinks() {
        const filter = `post_id:'${this.post.id}'`;
        const statsUrl = `${this.ghostPaths.url.api('links/')}?filter=${encodeURIComponent(filter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    @task
    *_fetchMentions() {
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {limit: 5, order: 'created_at desc', filter});
    }

    @task
    *fetchPostCountTask() {
        if (!this.post.emailOnly) {
            const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
            this.postCount = result.meta.pagination.total;
        }
    }

    @task
    *fetchPostTask() {
        const snapshot = {
            sentCount: this.post.email?.emailCount,
            openedCount: this.post.email?.openedCount,
            clickedCount: this.post.count.clicks,
            feedbackCount: this.totalFeedback,
            conversionsCount: this.post.count.conversions
        };

        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });
        this.post = result.toArray()[0];

        this.previousSentCount = snapshot.sentCount;
        this.previousOpenedCount = snapshot.openedCount;
        this.previousClickedCount = snapshot.clickedCount;
        this.previousFeedbackCount = snapshot.feedbackCount;
        this.previousConversionsCount = snapshot.conversionsCount;

        yield this.fetchLinks();

        return true;
    }

    // endregion
}
```
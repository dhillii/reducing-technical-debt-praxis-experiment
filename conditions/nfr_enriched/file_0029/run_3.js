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

const DISPLAY_OPTIONS = [{
    name: 'Free signups',
    value: 'signups'
}, {
    name: 'Paid conversions',
    value: 'paid'
}];

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

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    async checkPublishFlowModal() {
        if (localStorage.getItem('ghost-last-published-post')) {
            await this.fetchPostCountTask.perform();
            this.showPostCount = true;
            this.openPublishFlowModal();
            localStorage.removeItem('ghost-last-published-post');
        }
    }

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
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

    get isDropdownDisabled() {
        return !this.hasPaidConversionData || !this.hasFreeSignups;
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

    get hasPaidConversionData() {
        return this.sources.some(sourceData => sourceData.paidConversions > 0);
    }

    get hasFreeSignups() {
        return this.sources.some(sourceData => sourceData.signups > 0);
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    /**
     * Builds filter parameter for positive feedback
     * @returns {string} Filter parameter string
     */
    buildPositiveFeedbackFilter() {
        return `(feedback.post_id:'${this.post.id}'+feedback.score:1)`;
    }

    /**
     * Builds filter parameter for negative feedback
     * @returns {string} Filter parameter string
     */
    buildNegativeFeedbackFilter() {
        return `(feedback.post_id:'${this.post.id}'+feedback.score:0)`;
    }

    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = [
            {filterParam: this.buildPositiveFeedbackFilter()},
            {filterParam: this.buildNegativeFeedbackFilter()}
        ];
        const colors = ['#F080B2', '#8452f633'];
        return {values, labels, links, colors};
    }

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
        if (this.showSources) {
            this.fetchReferrersStats();
        } else {
            this.sources = [];
        }

        if (this.showLinks) {
            this.fetchLinks();
        } else {
            this.links = [];
        }

        if (this.showMentions) {
            this.fetchMentions();
        } else {
            this.mentions = [];
        }
    }

    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, {
            post: this.post
        });
    }

    /**
     * Cleans and normalizes link data
     * @param {Object} link - Link object to clean
     * @returns {Object} Cleaned link object
     */
    cleanLinkData(link) {
        return {
            ...link,
            link: {
                ...link.link,
                originalTo: link.link.to,
                to: this.utils.cleanTrackedUrl(link.link.to, false),
                title: this.utils.cleanTrackedUrl(link.link.to, true)
            }
        };
    }

    /**
     * Aggregates links by title and sums click counts
     * @param {Object} acc - Accumulator object
     * @param {Object} link - Link to aggregate
     * @returns {Object} Updated accumulator
     */
    aggregateLinkByTitle(acc, link) {
        if (!acc[link.link.title]) {
            acc[link.link.title] = link;
        } else {
            if (!acc[link.link.title].count) {
                acc[link.link.title].count = {clicks: 0};
            }
            if (!acc[link.link.title].count.clicks) {
                acc[link.link.title].count.clicks = 0;
            }
            acc[link.link.title].count.clicks += (link.count?.clicks ?? 0);
        }
        return acc;
    }

    /**
     * Compares click counts for sorting
     * @param {Object} a - First link
     * @param {Object} b - Second link
     * @returns {number} Sort order
     */
    compareLinksByClicks(a, b) {
        const aClicks = a.count?.clicks || 0;
        const bClicks = b.count?.clicks || 0;
        return bClicks - aClicks;
    }

    updateLinkData(linksData) {
        let cleanedLinks = linksData.map(link => this.cleanLinkData(link));

        const linksByTitle = cleanedLinks.reduce((acc, link) => this.aggregateLinkByTitle(acc, link), {});

        this.links = Object.values(linksByTitle).sort((a, b) => this.compareLinksByClicks(a, b));
    }

    async fetchReferrersStats() {
        try {
            if (this._fetchReferrersStats.isRunning) {
                return this._fetchReferrersStats.last;
            }
            return this._fetchReferrersStats.perform();
        } catch (e) {
            // Do not throw cancellation errors
            if (didCancel(e)) {
                return;
            }

            throw e;
        }
    }

    async fetchLinks() {
        try {
            if (this._fetchLinks.isRunning) {
                return this._fetchLinks.last;
            }

            return this._fetchLinks.perform();
        } catch (e) {
            // Do not throw cancellation errors
            if (didCancel(e)) {
                return;
            }

            throw e;
        }
    }

    /**
     * Builds bulk update URL for links
     * @param {string} filter - Filter parameter
     * @returns {string} Complete API URL
     */
    buildBulkUpdateUrl(filter) {
        return this.ghostPaths.url.api('links/bulk') + `?filter=${encodeURIComponent(filter)}`;
    }

    /**
     * Builds links fetch URL
     * @param {string} filter - Filter parameter
     * @returns {string} Complete API URL
     */
    buildLinksFetchUrl(filter) {
        return this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(filter)}`;
    }

    /**
     * Builds filter string for post links
     * @param {string} postId - Post ID
     * @param {string} linkUrl - Link URL (optional)
     * @returns {string} Filter string
     */
    buildLinksFilter(postId, linkUrl = null) {
        if (linkUrl) {
            return `post_id:'${postId}'+to:'${linkUrl}'`;
        }
        return `post_id:'${postId}'`;
    }

    @task
    *_updateLinks(linkId, newLink) {
        this.updateLinkId = linkId;
        let currentLink;
        this.links = this.links?.map((link) => {
            if (link.link.link_id === linkId) {
                currentLink = new URL(link.link.originalTo);
                return {
                    ...link,
                    link: {
                        ...link.link,
                        to: this.utils.cleanTrackedUrl(newLink, false),
                        title: this.utils.cleanTrackedUrl(newLink, true)
                    }
                };
            }
            return link;
        });

        const filter = this.buildLinksFilter(this.post.id, currentLink);
        let bulkUpdateUrl = this.buildBulkUpdateUrl(filter);
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        // Refresh links data
        const linksFilter = this.buildLinksFilter(this.post.id);
        let statsUrl = this.buildLinksFetchUrl(linksFilter);
        let result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
        this.showSuccess = this.updateLinkId;
        setTimeout(() => {
            this.showSuccess = null;
        }, 2000);
    }

    @task
    *_fetchReferrersStats() {
        let statsUrl = this.ghostPaths.url.api(`stats/referrers/posts/${this.post.id}`);
        let result = yield this.ajax.request(statsUrl);
        this.sources = result.stats.map((stat) => {
            return {
                source: stat.source ?? 'Direct',
                signups: stat.signups,
                paidConversions: stat.paid_conversions
            };
        });
    }

    @task
    *_fetchLinks() {
        const filter = this.buildLinksFilter(this.post.id);
        let statsUrl = this.buildLinksFetchUrl(filter);
        let result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
    }

    /**
     * Builds filter string for mentions
     * @param {string} postId - Post ID
     * @returns {string} Filter string
     */
    buildMentionsFilter(postId) {
        return `resource_id:'${postId}'+resource_type:post`;
    }

    @task
    *_fetchMentions() {
        const filter = this.buildMentionsFilter(this.post.id);
        this.mentions = yield this.store.query('mention', {limit: 5, order: 'created_at desc', filter});
    }

    @task
    *fetchPostCountTask() {
        if (!this.post.emailOnly) {
            const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
            let count = result.meta.pagination.total;

            this.postCount = count;
        }
    }

    @task
    *fetchPostTask() {
        const currentSentCount = this.post.email?.emailCount;
        const currentOpenedCount = this.post.email?.openedCount;
        const currentClickedCount = this.post.count.clicks;
        const currentFeedbackCount = this.totalFeedback;
        const currentConversionsCount = this.post.count.conversions;

        this.shouldAnimate = true;

        const result = yield this.store.query('post', {filter: `id:${this.post.id}`, include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment', limit: 1});
        this.post = result.toArray()[0];

        this.previousSentCount = currentSentCount;
        this.previousOpenedCount = currentOpenedCount;
        this.previousClickedCount = currentClickedCount;
        this.previousFeedbackCount = currentFeedbackCount;
        this.previousConversionsCount = currentConversionsCount;

        yield this.fetchLinks();

        return true;
    }

    /**
     * Determines if animation should be skipped for element
     * @param {HTMLElement} element - DOM element
     * @returns {boolean} True if animation should be skipped
     */
    shouldSkipAnimation(element) {
        if (!this.shouldAnimate) {
            return true;
        }

        if (element.classList.contains('sent') && this.post.email.emailCount === this.previousSentCount) {
            return true;
        }

        if (element.classList.contains('opened') && this.post.email.openedCount === this.previousOpenedCount) {
            return true;
        }

        if (element.classList.contains('clicked') && this.post.count.clicks === this.previousClickedCount) {
            return true;
        }

        if (element.classList.contains('feedback') && this.totalFeedback === this.previousFeedbackCount) {
            return true;
        }

        if (element.classList.contains('conversions') && this.post.count.conversions === this.previousConversionsCount) {
            return true;
        }

        return false;
    }

    /**
     * Builds CSS selector from element classes
     * @param {HTMLElement} element - DOM element
     * @returns {string} CSS selector string
     */
    buildElementSelector(element) {
        return Array.from(element.classList).map(className => `.${className}`).join('');
    }

    /**
     * Animates new number appearance
     * @param {string} selector - CSS selector
     */
    animateNewNumber(selector) {
        anime({
            targets: `${selector} .new-number span`,
            translateY: [10, 0],
            opacity: [0, 1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });
    }

    /**
     * Animates old number disappearance
     * @param {string} selector - CSS selector
     */
    animateOldNumber(selector) {
        anime({
            targets: `${selector} .old-number span`,
            translateY: [0, -10],
            opacity: [1, 0],
            easing: 'easeOutExpo',
            duration: 400,
            delay: (el, i) => 100 + 10 * i
        });
    }

    @action
    applyClasses(element) {
        if (this.shouldSkipAnimation(element)) {
            return;
        }

        const selector = this.buildElementSelector(element);
        this.animateNewNumber(selector);
        this.animateOldNumber(selector);
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
        return this.links !== null && this.souces !== null && this.mentions !== null;
    }
}
```
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
     * Cleans and normalizes link data for display
     * @param {Object} link - The link object to clean
     * @returns {Object} Cleaned link object
     */
    cleanLinkData(link) {
        const cleanedUrl = this.utils.cleanTrackedUrl(link.to, false);
        const cleanedTitle = this.utils.cleanTrackedUrl(link.to, true);

        return {
            ...link,
            originalTo: link.to,
            to: cleanedUrl,
            title: cleanedTitle
        };
    }

    /**
     * Aggregates links by title and sums click counts
     * @param {Array} cleanedLinks - Array of cleaned link objects
     * @returns {Object} Links aggregated by title
     */
    aggregateLinksByTitle(cleanedLinks) {
        return cleanedLinks.reduce((acc, link) => {
            const title = link.title;
            if (!acc[title]) {
                acc[title] = link;
            } else {
                if (!acc[title].count) {
                    acc[title].count = {clicks: 0};
                }
                if (!acc[title].count.clicks) {
                    acc[title].count.clicks = 0;
                }
                acc[title].count.clicks += (link.count?.clicks ?? 0);
            }
            return acc;
        }, {});
    }

    /**
     * Sorts links by click count in descending order
     * @param {Array} links - Array of link objects
     * @returns {Array} Sorted links
     */
    sortLinksByClicks(links) {
        return links.sort((a, b) => {
            const aClicks = a.count?.clicks || 0;
            const bClicks = b.count?.clicks || 0;
            return bClicks - aClicks;
        });
    }

    updateLinkData(linksData) {
        const cleanedLinks = linksData.map((link) => {
            return {
                ...link,
                link: this.cleanLinkData(link.link)
            };
        });

        const linksByTitle = this.aggregateLinksByTitle(
            cleanedLinks.map(item => item.link)
        );

        this.links = this.sortLinksByClicks(Object.values(linksByTitle));
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
     * Builds bulk update URL for link modifications
     * @param {string} postId - The post ID
     * @param {URL} currentLink - The current link URL
     * @returns {string} Encoded bulk update URL
     */
    buildBulkUpdateUrl(postId, currentLink) {
        const filter = `post_id:'${postId}'+to:'${currentLink}'`;
        const baseUrl = this.ghostPaths.url.api('links/bulk');
        return baseUrl + `?filter=${encodeURIComponent(filter)}`;
    }

    /**
     * Builds stats URL for fetching links
     * @param {string} postId - The post ID
     * @returns {string} Encoded stats URL
     */
    buildLinksStatsUrl(postId) {
        const filter = `post_id:'${postId}'`;
        const baseUrl = this.ghostPaths.url.api('links/');
        return baseUrl + `?filter=${encodeURIComponent(filter)}`;
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

        const bulkUpdateUrl = this.buildBulkUpdateUrl(this.post.id, currentLink);
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        // Refresh links data
        const statsUrl = this.buildLinksStatsUrl(this.post.id);
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
        const statsUrl = this.buildLinksStatsUrl(this.post.id);
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
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
            const count = result.meta.pagination.total;

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
     * Determines if animation should be skipped for the given element
     * @param {Element} element - The DOM element to check
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
     * @param {Element} element - The DOM element
     * @returns {string} CSS selector string
     */
    buildElementSelector(element) {
        return Array.from(element.classList).map(className => `.${className}`).join('');
    }

    /**
     * Animates new number appearance
     * @param {string} selector - CSS selector for target elements
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
     * @param {string} selector - CSS selector for target elements
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
        return this.links !== null && this.sources !== null && this.mentions !== null;
    }
}
```
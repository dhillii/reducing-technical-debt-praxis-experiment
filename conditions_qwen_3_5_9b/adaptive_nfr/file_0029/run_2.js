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

/**
 * Extracts CSS selector targets from element class list
 * @param {HTMLElement} element 
 * @returns {string}
 */
const extractAnimationTargets = (element) => {
    const classes = Array.from(element.classList);
    const selectors = classes.map(className => `.${className}`).join('');
    return `${selectors} .new-number span`;
};

/**
 * Extracts CSS selector targets for old number animation
 * @param {HTMLElement} element 
 * @returns {string}
 */
const extractOldAnimationTargets = (element) => {
    const classes = Array.from(element.classList);
    const selectors = classes.map(className => `.${className}`).join('');
    return `${selectors} .old-number span`;
};

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

    /**
     * Determines available display options based on data availability
     * @returns {Array}
     */
    get allowedDisplayOptions() {
        if (!this.hasPaidConversionData) {
            return this.displayOptions.filter(d => d.value === 'signups');
        }

        if (!this.hasFreeSignups) {
            return this.displayOptions.filter(d => d.value === 'paid');
        }

        return this.displayOptions;
    }

    /**
     * Determines if the display dropdown should be disabled
     * @returns {boolean}
     */
    get isDropdownDisabled() {
        return !this.hasPaidConversionData || !this.hasFreeSignups;
    }

    /**
     * Gets the currently selected display option
     * @returns {Object}
     */
    get selectedDisplayOption() {
        if (!this.hasPaidConversionData) {
            return this.displayOptions.find(d => d.value === 'signups');
        }

        if (!this.hasFreeSignups) {
            return this.displayOptions.find(d => d.value === 'paid');
        }

        return this.displayOptions.find(d => d.value === this.sortColumn) ?? this.displayOptions[0];
    }

    /**
     * Gets the currently selected sort column
     * @returns {string}
     */
    get selectedSortColumn() {
        if (!this.hasPaidConversionData) {
            return 'signups';
        }

        if (!this.hasFreeSignups) {
            return 'paid';
        }
        return this.sortColumn;
    }

    /**
     * Checks if paid conversion data exists
     * @returns {boolean}
     */
    get hasPaidConversionData() {
        return this.sources.some(sourceData => sourceData.paidConversions > 0);
    }

    /**
     * Checks if free signup data exists
     * @returns {boolean}
     */
    get hasFreeSignups() {
        return this.sources.some(sourceData => sourceData.signups > 0);
    }

    /**
     * Calculates total feedback count
     * @returns {number}
     */
    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    /**
     * Generates feedback chart data
     * @returns {Object}
     */
    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = [
            {filterParam: `(feedback.post_id:'${this.post.id}'+feedback.score:1)`},
            {filterParam: `(feedback.post_id:'${this.post.id}'+feedback.score:0)`}
        ];
        const colors = ['#F080B2', '#8452f633'];
        return {values, labels, links, colors};
    }

    /**
     * Handles display option change
     * @param {Object} selected 
     */
    @action
    onDisplayChange(selected) {
        this.sortColumn = selected.value;
    }

    /**
     * Sets the sort column
     * @param {string} column 
     */
    @action
    setSortColumn(column) {
        this.sortColumn = column;
    }

    /**
     * Updates a link
     * @param {string} linkId 
     * @param {string} linkTo 
     */
    @action
    updateLink(linkId, linkTo) {
        if (this._updateLinks.isRunning) {
            return this._updateLinks.last;
        }
        return this._updateLinks.perform(linkId, linkTo);
    }

    /**
     * Loads data based on visibility settings
     */
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

    /**
     * Toggles the publish flow modal
     */
    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    /**
     * Confirms member deletion
     */
    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, {
            post: this.post
        });
    }

    /**
     * Updates link data from API response
     * @param {Array} linksData 
     */
    updateLinkData(linksData) {
        let cleanedLinks = linksData.map((link) => {
            return {
                ...link,
                link: {
                    ...link.link,
                    originalTo: link.link.to,
                    to: this.utils.cleanTrackedUrl(link.link.to, false),
                    title: this.utils.cleanTrackedUrl(link.link.to, true)
                }
            };
        });

        const linksByTitle = cleanedLinks.reduce((acc, link) => {
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
        }, {});

        this.links = Object.values(linksByTitle).sort((a, b) => {
            const aClicks = a.count?.clicks || 0;
            const bClicks = b.count?.clicks || 0;
            return bClicks - aClicks;
        });
    }

    /**
     * Fetches referrers statistics
     * @returns {Promise}
     */
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

    /**
     * Fetches link statistics
     * @returns {Promise}
     */
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
     * Updates link data
     * @param {string} linkId 
     * @param {string} newLink 
     */
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

        const filter = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        let bulkUpdateUrl = this.ghostPaths.url.api(`links/bulk`) + `?filter=${encodeURIComponent(filter)}`;
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        // Refresh links data
        const linksFilter = `post_id:'${this.post.id}'`;
        let statsUrl = this.ghostPaths.url.api(`links/`) + `?filter=${encodeURIComponent(linksFilter)}`;
        let result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
        this.showSuccess = this.updateLinkId;
        setTimeout(() => {
            this.showSuccess = null;
        }, 2000);
    }

    /**
     * Fetches referrers statistics
     */
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

    /**
     * Fetches link statistics
     */
    @task
    *_fetchLinks() {
        const filter = `post_id:'${this.post.id}'`;
        let statsUrl = this.ghostPaths.url.api(`links/`) + `?filter=${encodeURIComponent(filter)}`;
        let result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    /**
     * Fetches mentions
     * @returns {Promise}
     */
    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
    }

    /**
     * Fetches mentions
     */
    @task
    *_fetchMentions() {
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {limit: 5, order: 'created_at desc', filter});
    }

    /**
     * Fetches post count
     */
    @task
    *fetchPostCountTask() {
        if (!this.post.emailOnly) {
            const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
            let count = result.meta.pagination.total;

            this.postCount = count;
        }
    }

    /**
     * Fetches post data with email analytics
     */
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
     * Applies animation classes to element
     * @param {HTMLElement} element 
     */
    @action
    applyClasses(element) {
        const shouldAnimateSent = this.shouldAnimate &&
            (element.classList.contains('sent') && this.post.email.emailCount !== this.previousSentCount);
        const shouldAnimateOpened = this.shouldAnimate &&
            (element.classList.contains('opened') && this.post.email.openedCount !== this.previousOpenedCount);
        const shouldAnimateClicked = this.shouldAnimate &&
            (element.classList.contains('clicked') && this.post.count.clicks !== this.previousClickedCount);
        const shouldAnimateFeedback = this.shouldAnimate &&
            (element.classList.contains('feedback') && this.totalFeedback !== this.previousFeedbackCount);
        const shouldAnimateConversions = this.shouldAnimate &&
            (element.classList.contains('conversions') && this.post.count.conversions !== this.previousConversionsCount);

        if (!shouldAnimateSent && !shouldAnimateOpened && !shouldAnimateClicked && !shouldAnimateFeedback && !shouldAnimateConversions) {
            return;
        }

        anime({
            targets: extractAnimationTargets(element),
            translateY: [10,0],
            opacity: [0,1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });

        anime({
            targets: extractOldAnimationTargets(element),
            translateY: [0,-10],
            opacity: [1,0],
            easing: 'easeOutExpo',
            duration: 400,
            delay: (el, i) => 100 + 10 * i
        });
    }

    /**
     * Checks if links should be shown
     * @returns {boolean}
     */
    get showLinks() {
        return this.post.showEmailClickAnalytics;
    }

    /**
     * Checks if sources should be shown
     * @returns {boolean}
     */
    get showSources() {
        return this.post.showAttributionAnalytics;
    }

    /**
     * Checks if mentions should be shown
     * @returns {boolean}
     */
    get showMentions() {
        return this.feature.get('webmentions');
    }

    /**
     * Checks if data is loaded
     * @returns {boolean}
     */
    get isLoaded() {
        return this.links !== null && this.souces !== null && this.mentions !== null;
    }
}
```
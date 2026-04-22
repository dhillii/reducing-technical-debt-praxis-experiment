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
 * @class Analytics
 * @extends Component
 */
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
    @tracked previousSentCount = this.post?.email?.emailCount;
    @tracked previousOpenedCount = this.post?.email?.openedCount;
    @tracked previousClickedCount = this.post?.count?.clicks;
    @tracked previousFeedbackCount = this.totalFeedback;
    @tracked previousConversionsCount = this.post?.count?.conversions;
    displayOptions = DISPLAY_OPTIONS;

    /**
     * @constructor
     */
    constructor() {
        super(...arguments);
        this.checkPublishFlowModal();
    }

    /**
     * Opens the publish flow modal.
     */
    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    /**
     * Checks if the publish flow modal should be opened.
     */
    async checkPublishFlowModal() {
        if (localStorage.getItem('ghost-last-published-post')) {
            await this.fetchPostCountTask.perform();
            this.showPostCount = true;
            this.openPublishFlowModal();
            localStorage.removeItem('ghost-last-published-post');
        }
    }

    /**
     * Gets the post.
     * @returns {Object} The post.
     */
    get post() {
        return this._post ?? this.args.post;
    }

    /**
     * Sets the post.
     * @param {Object} value The post.
     */
    set post(value) {
        this._post = value;
    }

    /**
     * Gets the allowed display options.
     * @returns {Array} The allowed display options.
     */
    get allowedDisplayOptions() {
        return this.displayOptions.filter(this._isDisplayOptionAllowed);
    }

    /**
     * Checks if a display option is allowed.
     * @param {Object} option The display option.
     * @returns {Boolean} True if the display option is allowed, false otherwise.
     * @private
     */
    _isDisplayOptionAllowed(option) {
        if (option.value === 'signups') {
            return this.hasFreeSignups;
        } else if (option.value === 'paid') {
            return this.hasPaidConversionData;
        }
        return true;
    }

    /**
     * Gets the selected display option.
     * @returns {Object} The selected display option.
     */
    get selectedDisplayOption() {
        return this.allowedDisplayOptions.find(option => option.value === this.sortColumn) ?? this.allowedDisplayOptions[0];
    }

    /**
     * Gets the selected sort column.
     * @returns {String} The selected sort column.
     */
    get selectedSortColumn() {
        return this.sortColumn;
    }

    /**
     * Checks if there is paid conversion data.
     * @returns {Boolean} True if there is paid conversion data, false otherwise.
     */
    get hasPaidConversionData() {
        return this.sources.some(sourceData => sourceData.paidConversions > 0);
    }

    /**
     * Checks if there are free signups.
     * @returns {Boolean} True if there are free signups, false otherwise.
     */
    get hasFreeSignups() {
        return this.sources.some(sourceData => sourceData.signups > 0);
    }

    /**
     * Gets the total feedback.
     * @returns {Number} The total feedback.
     */
    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    /**
     * Gets the feedback chart data.
     * @returns {Object} The feedback chart data.
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
     * Handles the display change event.
     * @param {Object} selected The selected display option.
     */
    @action
    onDisplayChange(selected) {
        this.sortColumn = selected.value;
    }

    /**
     * Sets the sort column.
     * @param {String} column The sort column.
     */
    @action
    setSortColumn(column) {
        this.sortColumn = column;
    }

    /**
     * Updates a link.
     * @param {Number} linkId The link ID.
     * @param {String} linkTo The link to update to.
     */
    @action
    updateLink(linkId, linkTo) {
        if (this._updateLinks.isRunning) {
            return this._updateLinks.last;
        }
        return this._updateLinks.perform(linkId, linkTo);
    }

    /**
     * Loads the data.
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
     * Toggles the publish flow modal.
     */
    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    /**
     * Confirms the deletion of a member.
     */
    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, {
            post: this.post
        });
    }

    /**
     * Updates the link data.
     * @param {Array} linksData The link data.
     */
    updateLinkData(linksData) {
        let cleanedLinks = linksData.map(this._cleanLink);
        const linksByTitle = cleanedLinks.reduce(this._reduceLinks, {});

        this.links = Object.values(linksByTitle).sort(this._sortLinks);
    }

    /**
     * Cleans a link.
     * @param {Object} link The link.
     * @returns {Object} The cleaned link.
     * @private
     */
    _cleanLink(link) {
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
     * Reduces the links.
     * @param {Object} acc The accumulator.
     * @param {Object} link The link.
     * @returns {Object} The reduced links.
     * @private
     */
    _reduceLinks(acc, link) {
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
     * Sorts the links.
     * @param {Object} a The first link.
     * @param {Object} b The second link.
     * @returns {Number} The sort order.
     * @private
     */
    _sortLinks(a, b) {
        const aClicks = a.count?.clicks || 0;
        const bClicks = b.count?.clicks || 0;
        return bClicks - aClicks;
    }

    /**
     * Fetches the referrers stats.
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
     * Fetches the links.
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
     * Updates the links.
     * @param {Number} linkId The link ID.
     * @param {String} newLink The new link.
     */
    @task
    *_updateLinks(linkId, newLink) {
        this.updateLinkId = linkId;
        let currentLink;
        this.links = this.links?.map(this._updateLink.bind(this, linkId, newLink));

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
     * Updates a link.
     * @param {Number} linkId The link ID.
     * @param {String} newLink The new link.
     * @param {Object} link The link.
     * @returns {Object} The updated link.
     * @private
     */
    _updateLink(linkId, newLink, link) {
        if (link.link.link_id === linkId) {
            const currentLink = new URL(link.link.originalTo);
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
    }

    /**
     * Fetches the referrers stats.
     */
    @task
    *_fetchReferrersStats() {
        let statsUrl = this.ghostPaths.url.api(`stats/referrers/posts/${this.post.id}`);
        let result = yield this.ajax.request(statsUrl);
        this.sources = result.stats.map(this._mapSource);
    }

    /**
     * Maps a source.
     * @param {Object} stat The stat.
     * @returns {Object} The mapped source.
     * @private
     */
    _mapSource(stat) {
        return {
            source: stat.source ?? 'Direct',
            signups: stat.signups,
            paidConversions: stat.paid_conversions
        };
    }

    /**
     * Fetches the links.
     */
    @task
    *_fetchLinks() {
        const filter = `post_id:'${this.post.id}'`;
        let statsUrl = this.ghostPaths.url.api(`links/`) + `?filter=${encodeURIComponent(filter)}`;
        let result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    /**
     * Fetches the mentions.
     */
    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
    }

    /**
     * Fetches the mentions.
     */
    @task
    *_fetchMentions() {
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {limit: 5, order: 'created_at desc', filter});
    }

    /**
     * Fetches the post count task.
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
     * Fetches the post task.
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
     * Applies classes to an element.
     * @param {HTMLElement} element The element.
     */
    @action
    applyClasses(element) {
        if (!this.shouldAnimate ||
            (element.classList.contains('sent') && this.post.email.emailCount === this.previousSentCount) ||
            (element.classList.contains('opened') && this.post.email.openedCount === this.previousOpenedCount) ||
            (element.classList.contains('clicked') && this.post.count.clicks === this.previousClickedCount) ||
            (element.classList.contains('feedback') && this.totalFeedback === this.previousFeedbackCount) ||
            (element.classList.contains('conversions') && this.post.count.conversions === this.previousConversionsCount)
        ) {
            return;
        }

        anime({
            targets: `${Array.from(element.classList).map(className => `.${className}`).join('')} .new-number span`,
            translateY: [10,0],
            // translateZ: 0,
            opacity: [0,1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });

        anime({
            targets: `${Array.from(element.classList).map(className => `.${className}`).join('')} .old-number span`,
            translateY: [0,-10],
            opacity: [1,0],
            easing: 'easeOutExpo',
            duration: 400,
            delay: (el, i) => 100 + 10 * i
        });
    }

    /**
     * Checks if the links should be shown.
     * @returns {Boolean} True if the links should be shown, false otherwise.
     */
    get showLinks() {
        return this.post.showEmailClickAnalytics;
    }

    /**
     * Checks if the sources should be shown.
     * @returns {Boolean} True if the sources should be shown, false otherwise.
     */
    get showSources() {
        return this.post.showAttributionAnalytics;
    }

    /**
     * Checks if the mentions should be shown.
     * @returns {Boolean} True if the mentions should be shown, false otherwise.
     */
    get showMentions() {
        return this.feature.get('webmentions');
    }

    /**
     * Checks if the data is loaded.
     * @returns {Boolean} True if the data is loaded, false otherwise.
     */
    get isLoaded() {
        return this.links !== null && this.sources !== null && this.mentions !== null;
    }
}
```
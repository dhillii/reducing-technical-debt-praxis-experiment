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
 * Builds a filter string for API queries
 * @param {string} postId - The post ID
 * @param {string} [additionalFilter] - Additional filter criteria
 * @returns {string} Encoded filter string
 */
function buildFilterString(postId, additionalFilter = '') {
    const baseFilter = `post_id:'${postId}'`;
    return additionalFilter ? `${baseFilter}+${additionalFilter}` : baseFilter;
}

/**
 * Builds an API URL with filter parameter
 * @param {string} basePath - Base API path
 * @param {string} filter - Filter string
 * @returns {string} Complete API URL
 */
function buildApiUrl(basePath, filter) {
    return `${basePath}?filter=${encodeURIComponent(filter)}`;
}

/**
 * Determines which display options are available based on data
 * @param {boolean} hasPaidConversionData - Whether paid conversion data exists
 * @param {boolean} hasFreeSignups - Whether free signup data exists
 * @param {Array} displayOptions - Available display options
 * @returns {Array} Filtered display options
 */
function getAvailableDisplayOptions(hasPaidConversionData, hasFreeSignups, displayOptions) {
    if (!hasPaidConversionData) {
        return displayOptions.filter(d => d.value === 'signups');
    }
    if (!hasFreeSignups) {
        return displayOptions.filter(d => d.value === 'paid');
    }
    return displayOptions;
}

/**
 * Determines the selected display option based on data availability
 * @param {boolean} hasPaidConversionData - Whether paid conversion data exists
 * @param {boolean} hasFreeSignups - Whether free signup data exists
 * @param {string} sortColumn - Current sort column
 * @param {Array} displayOptions - Available display options
 * @returns {Object} Selected display option
 */
function getSelectedDisplayOption(hasPaidConversionData, hasFreeSignups, sortColumn, displayOptions) {
    if (!hasPaidConversionData) {
        return displayOptions.find(d => d.value === 'signups');
    }
    if (!hasFreeSignups) {
        return displayOptions.find(d => d.value === 'paid');
    }
    return displayOptions.find(d => d.value === sortColumn) ?? displayOptions[0];
}

/**
 * Determines the selected sort column based on data availability
 * @param {boolean} hasPaidConversionData - Whether paid conversion data exists
 * @param {boolean} hasFreeSignups - Whether free signup data exists
 * @param {string} sortColumn - Current sort column
 * @returns {string} Selected sort column
 */
function getSelectedSortColumn(hasPaidConversionData, hasFreeSignups, sortColumn) {
    if (!hasPaidConversionData) {
        return 'signups';
    }
    if (!hasFreeSignups) {
        return 'paid';
    }
    return sortColumn;
}

/**
 * Determines if dropdown should be disabled
 * @param {boolean} hasPaidConversionData - Whether paid conversion data exists
 * @param {boolean} hasFreeSignups - Whether free signup data exists
 * @returns {boolean} Whether dropdown is disabled
 */
function isDropdownDisabledCheck(hasPaidConversionData, hasFreeSignups) {
    return !hasPaidConversionData || !hasFreeSignups;
}

/**
 * Checks if animation should be skipped for an element
 * @param {HTMLElement} element - DOM element to check
 * @param {Object} post - Post data
 * @param {number} previousSentCount - Previous sent count
 * @param {number} previousOpenedCount - Previous opened count
 * @param {number} previousClickedCount - Previous clicked count
 * @param {number} previousFeedbackCount - Previous feedback count
 * @param {number} previousConversionsCount - Previous conversions count
 * @param {number} totalFeedback - Total feedback count
 * @returns {boolean} Whether to skip animation
 */
function shouldSkipAnimation(element, post, previousSentCount, previousOpenedCount, previousClickedCount, previousFeedbackCount, previousConversionsCount, totalFeedback) {
    const checks = [
        {
            condition: element.classList.contains('sent'),
            unchanged: post.email?.emailCount === previousSentCount
        },
        {
            condition: element.classList.contains('opened'),
            unchanged: post.email?.openedCount === previousOpenedCount
        },
        {
            condition: element.classList.contains('clicked'),
            unchanged: post.count.clicks === previousClickedCount
        },
        {
            condition: element.classList.contains('feedback'),
            unchanged: totalFeedback === previousFeedbackCount
        },
        {
            condition: element.classList.contains('conversions'),
            unchanged: post.count.conversions === previousConversionsCount
        }
    ];

    return checks.some(check => check.condition && check.unchanged);
}

/**
 * Generates CSS selector from element classes
 * @param {HTMLElement} element - DOM element
 * @returns {string} CSS selector
 */
function generateClassSelector(element) {
    return Array.from(element.classList).map(className => `.${className}`).join('');
}

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
        return getAvailableDisplayOptions(this.hasPaidConversionData, this.hasFreeSignups, this.displayOptions);
    }

    get isDropdownDisabled() {
        return isDropdownDisabledCheck(this.hasPaidConversionData, this.hasFreeSignups);
    }

    get selectedDisplayOption() {
        return getSelectedDisplayOption(this.hasPaidConversionData, this.hasFreeSignups, this.sortColumn, this.displayOptions);
    }

    get selectedSortColumn() {
        return getSelectedSortColumn(this.hasPaidConversionData, this.hasFreeSignups, this.sortColumn);
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

    get feedbackChartData() {
        const postId = this.post.id;
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = [
            {filterParam: `(feedback.post_id:'${postId}'+feedback.score:1)`},
            {filterParam: `(feedback.post_id:'${postId}'+feedback.score:0)`}
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
        let bulkUpdateUrl = buildApiUrl(this.ghostPaths.url.api('links/bulk'), filter);
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        // Refresh links data
        const linksFilter = buildFilterString(this.post.id);
        let statsUrl = buildApiUrl(this.ghostPaths.url.api('links/'), linksFilter);
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
        const filter = buildFilterString(this.post.id);
        let statsUrl = buildApiUrl(this.ghostPaths.url.api('links/'), filter);
        let result = yield this.ajax.request(statsUrl);
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
        if (!this
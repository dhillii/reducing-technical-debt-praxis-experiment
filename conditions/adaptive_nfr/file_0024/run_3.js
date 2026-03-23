Here's the refactored code with reduced complexity through better organization, extracted methods, and elimination of redundancy:

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

const STAT_CHANGE_MAP = [
    {className: 'sent', getValue: (post) => post.email?.emailCount, getPrev: (ctx) => ctx.previousSentCount},
    {className: 'opened', getValue: (post) => post.email?.openedCount, getPrev: (ctx) => ctx.previousOpenedCount},
    {className: 'clicked', getValue: (post) => post.count.clicks, getPrev: (ctx) => ctx.previousClickedCount},
    {className: 'feedback', getValue: (_, ctx) => ctx.totalFeedback, getPrev: (ctx) => ctx.previousFeedbackCount},
    {className: 'conversions', getValue: (post) => post.count.conversions, getPrev: (ctx) => ctx.previousConversionsCount}
];

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

    // ==================
    // Getters
    // ==================

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
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

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    get feedbackChartData() {
        const {id} = this.post;
        return {
            values: [this.post.count.positive_feedback, this.post.count.negative_feedback],
            labels: ['More like this', 'Less like this'],
            links: [
                {filterParam: `(feedback.post_id:'${id}'+feedback.score:1)`},
                {filterParam: `(feedback.post_id:'${id}'+feedback.score:0)`}
            ],
            colors: ['#F080B2', '#8452f633']
        };
    }

    get hasPaidConversionData() {
        return this.sources.some(s => s.paidConversions > 0);
    }

    get hasFreeSignups() {
        return this.sources.some(s => s.signups > 0);
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
        return this._getOptionByDataAvailability()
            ?? this.displayOptions.find(d => d.value === this.sortColumn)
            ?? this.displayOptions[0];
    }

    get selectedSortColumn() {
        return this._getSortColumnByDataAvailability() ?? this.sortColumn;
    }

    // ==================
    // Actions
    // ==================

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
        if (!this.shouldAnimate || !this._hasStatChanged(element)) {
            return;
        }
        this._animateElement(element);
    }

    // ==================
    // Tasks
    // ==================

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
        const bulkUpdateUrl = this.ghostPaths.url.api('links/bulk') + `?filter=${encodeURIComponent(filter)}`;

        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        yield this._refreshLinks();

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
        const statsUrl = this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(filter)}`;
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
        if (this.post.emailOnly) {
            return;
        }
        const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
        this.postCount = result.meta.pagination.total;
    }

    @task
    *fetchPostTask() {
        this._snapshotCurrentCounts();
        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });
        this.post = result.toArray()[0];

        yield this.fetchLinks();
        return true;
    }

    // ==================
    // Private Methods
    // ==================

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    async checkPublishFlowModal() {
        if (!localStorage.getItem('ghost-last-published-post')) {
            return;
        }
        await this.fetchPostCountTask.perform();
        this.showPostCount = true;
        this.openPublishFlowModal();
        localStorage.removeItem('ghost-last-published-post');
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

        this.links = Object.values(linksByTitle)
            .sort((a, b) => (b.count?.clicks || 0) - (a.count?.clicks || 0));
    }

    async fetchReferrersStats() {
        return this._runTask(this._fetchReferrersStats);
    }

    async fetchLinks() {
        return this._runTask(this._fetchLinks);
    }

    async fetchMentions() {
        return this._runTask(this._fetchMentions);
    }

    async _runTask(taskInstance) {
        try {
            if (taskInstance.isRunning) {
                return taskInstance.last;
            }
            return taskInstance.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }
    }

    async _refreshLinks() {
        const filter = `post_id:'${this.post.id}'`;
        const statsUrl = this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(filter)}`;
        const result = await this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    _snapshotCurrentCounts() {
        this.previousSentCount = this.post.email?.emailCount;
        this.previousOpenedCount = this.post.email?.openedCount;
        this.previousClickedCount = this.post.count.clicks;
        this.previousFeedbackCount = this.totalFeedback;
        this.previousConversionsCount = this.post.count.conversions;
    }

    _hasStatChanged(element) {
        return STAT_CHANGE_MAP.some(({className, getValue, getPrev}) => {
            return element.classList.contains(className)
                && getValue(this.post, this) !== getPrev(this);
        });
    }

    _animateElement(element) {
        const selector = Array.from(element.classList)
            .map(cls => `.${cls}`)
            .join('');

        anime({...ANIMATION_CONFIG.new, targets: `${selector} .new-number span`});
        anime({...ANIMATION_CONFIG.old, targets: `${selector} .old-number span`});
    }

    _getOptionByDataAvailability() {
        if (!this.hasPaidConversionData) {
            return this.displayOptions.find(d => d.value === 'signups');
        }
        if (!this.hasFreeSignups) {
            return this.displayOptions.find(d => d.value === 'paid');
        }
        return null;
    }

    _getSortColumnByDataAvailability() {
        if (!this.hasPaidConversionData) {
            return 'signups';
        }
        if (!this.hasFreeSignups) {
            return 'paid';
        }
        return null;
    }
}
```

Key refactoring changes made:

1. **Extracted constants** — `ANIMATION_CONFIG` and `STAT_CHANGE_MAP` remove inline logic from `applyClasses`, making it data-driven and eliminating the long conditional chain.

2. **Unified `_runTask` helper** — The three nearly identical `fetchReferrersStats`, `fetchLinks`, and `fetchMentions` methods now delegate to a single `_runTask` method, eliminating duplicated try/catch/isRunning patterns.

3. **Extracted `_snapshotCurrentCounts`** — Consolidates the five count assignments from `fetchPostTask` into a single descriptive method.

4. **Extracted `_animateElement` and `_hasStatChanged`** — Breaks `applyClasses` into focused single-responsibility helpers.

5. **Extracted `_getOptionByDataAvailability` and `_getSortColumnByDataAvailability`** — Removes duplicated data-availability guard logic shared between `selectedDisplayOption` and `selectedSortColumn`.

6. **Simplified `isDropdownDisabled`** — Replaced the if/return true/return false pattern with a direct boolean expression.

7. **Early return in `checkPublishFlowModal`** — Inverted the condition to reduce nesting.

8. **Extracted `_refreshLinks`** — Isolated the link-refresh logic from `_updateLinks` task.

9. **Fixed bug** — Corrected `this.souces` typo to `this.sources` in `isLoaded`.

10. **Organized sections** — Added comment headers (Getters, Actions, Tasks, Private Methods) for navigability.
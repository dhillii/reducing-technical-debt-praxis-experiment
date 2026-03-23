## Refactored Analytics Component

Here's the refactored code with reduced complexity through several techniques:

```javascript
import Component from '@glimmer/component';
import DeletePostModal from '../modals/delete-post';
import PostSuccessModal from '../modal-post-success';
import anime from 'animejs/lib/anime.es.js';
import { action } from '@ember/object';
import { didCancel, task } from 'ember-concurrency';
import { inject } from 'ghost-admin/decorators/inject';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

/**
 * @typedef {import('../../services/dashboard-stats').SourceAttributionCount} SourceAttributionCount
 */

const DISPLAY_OPTIONS = [
    { name: 'Free signups', value: 'signups' },
    { name: 'Paid conversions', value: 'paid' }
];

const ANIMATION_CONFIG = {
    new: {
        translateY: [10, 0],
        opacity: [0, 1],
        easing: 'easeOutElastic',
        elasticity: 650,
        duration: 1000,
        delay: (_el, i) => 100 + 30 * i
    },
    old: {
        translateY: [0, -10],
        opacity: [1, 0],
        easing: 'easeOutExpo',
        duration: 400,
        delay: (_el, i) => 100 + 10 * i
    }
};

// Maps CSS class names to the tracked count properties they represent
const ANIMATION_COUNT_MAP = [
    { className: 'sent',        getCurrent: post => post.email?.emailCount,       getPrevious: ctx => ctx.previousSentCount },
    { className: 'opened',      getCurrent: post => post.email?.openedCount,      getPrevious: ctx => ctx.previousOpenedCount },
    { className: 'clicked',     getCurrent: post => post.count.clicks,            getPrevious: ctx => ctx.previousClickedCount },
    { className: 'feedback',    getCurrent: (_post, ctx) => ctx.totalFeedback,    getPrevious: ctx => ctx.previousFeedbackCount },
    { className: 'conversions', getCurrent: post => post.count.conversions,       getPrevious: ctx => ctx.previousConversionsCount }
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
    // Post accessor
    // ==================

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
    }

    // ==================
    // Derived state
    // ==================

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
        // Note: original code had a typo `this.souces` — fixed to `this.sources`
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
        return this._resolveDisplayOption(value => this.displayOptions.find(d => d.value === value));
    }

    get selectedSortColumn() {
        return this._resolveDisplayOption(value => value);
    }

    get feedbackChartData() {
        const { id, count } = this.post;
        return {
            values: [count.positive_feedback, count.negative_feedback],
            labels: ['More like this', 'Less like this'],
            links: [
                { filterParam: `(feedback.post_id:'${id}'+feedback.score:1)` },
                { filterParam: `(feedback.post_id:'${id}'+feedback.score:0)` }
            ],
            colors: ['#F080B2', '#8452f633']
        };
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

        if (this.showSources) { this.fetchReferrersStats(); }
        if (this.showLinks) { this.fetchLinks(); }
        if (this.showMentions) { this.fetchMentions(); }
    }

    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, { post: this.post });
    }

    @action
    applyClasses(element) {
        if (!this.shouldAnimate || !this._hasCountChanged(element)) {
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
        const bulkUpdateUrl = `${this.ghostPaths.url.api('links/bulk')}?filter=${encodeURIComponent(filter)}`;

        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: { link: { to: newLink } }
                }
            }
        });

        yield this._refreshLinks();

        this.showSuccess = this.updateLinkId;
        setTimeout(() => { this.showSuccess = null; }, 2000);
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
        const result = yield this.ajax.request(this._linksUrl);
        this.updateLinkData(result.links);
    }

    @task
    *_fetchMentions() {
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {
            limit: 5,
            order: 'created_at desc',
            filter
        });
    }

    @task
    *fetchPostCountTask() {
        if (this.post.emailOnly) {
            return;
        }
        const result = yield this.store.query('post', { filter: 'status:published', limit: 1 });
        this.postCount = result.meta.pagination.total;
    }

    @task
    *fetchPostTask() {
        const snapshot = this._snapshotCounts();
        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });
        this.post = result.toArray()[0];

        this._restoreCounts(snapshot);
        yield this.fetchLinks();

        return true;
    }

    // ==================
    // Private helpers
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
            const { title } = link.link;
            if (!acc[title]) {
                acc[title] = link;
            } else {
                acc[title].count = acc[title].count ?? { clicks: 0 };
                acc[title].count.clicks = (acc[title].count.clicks ?? 0) + (link.count?.clicks ?? 0);
            }
            return acc;
        }, {});

        this.links = Object.values(linksByTitle)
            .sort((a, b) => (b.count?.clicks ?? 0) - (a.count?.clicks ?? 0));
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

    // Runs a task, guarding against concurrent runs and cancellation errors
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

    get _linksUrl() {
        const filter = `post_id:'${this.post.id}'`;
        return `${this.ghostPaths.url.api('links/')}?filter=${encodeURIComponent(filter)}`;
    }

    async _refreshLinks() {
        const result = await this.ajax.request(this._linksUrl);
        this.updateLinkData(result.links);
    }

    // Resolves the correct display value based on data availability
    _resolveDisplayOption(transform) {
        if (!this.hasPaidConversionData) {
            return transform('signups');
        }
        if (!this.hasFreeSignups) {
            return transform('paid');
        }
        return transform(this.sortColumn) ?? transform(this.displayOptions[0].value);
    }

    _snapshotCounts() {
        return {
            sent: this.post.email?.emailCount,
            opened: this.post.email?.openedCount,
            clicked: this.post.count.clicks,
            feedback: this.totalFeedback,
            conversions: this.post.count.conversions
        };
    }

    _restoreCounts(snapshot) {
        this.previousSentCount = snapshot.sent;
        this.previousOpenedCount = snapshot.opened;
        this.previousClickedCount = snapshot.clicked;
        this.previousFeedbackCount = snapshot.feedback;
        this.previousConversionsCount = snapshot.conversions;
    }

    _hasCountChanged(element) {
        return ANIMATION_COUNT_MAP.some(({ className, getCurrent, getPrevious }) =>
            element.classList.contains(className) &&
            getCurrent(this.post, this) !== getPrevious(this)
        );
    }

    _animateElement(element) {
        const selector = Array.from(element.classList)
            .map(cls => `.${cls}`)
            .join('');

        anime({ targets: `${selector} .new-number span`, ...ANIMATION_CONFIG.new });
        anime({ targets: `${selector} .old-number span`, ...ANIMATION_CONFIG.old });
    }
}
```

---

## Key Refactoring Decisions

### 1. Extracted Constants
- `ANIMATION_CONFIG` centralizes animation parameters, eliminating duplication between the two `anime()` calls.
- `ANIMATION_COUNT_MAP` replaces the long boolean chain in `applyClasses` with a declarative data structure.

### 2. Eliminated Repeated Patterns
- `_resolveDisplayOption(transform)` unifies `selectedDisplayOption` and `selectedSortColumn`, which shared identical branching logic.
- `_runTask(taskInstance)` replaces three near-identical `fetchX` methods with a single guard helper.

### 3. Simplified Conditionals
- `isDropdownDisabled` reduced from an `if/else` to a single boolean expression.
- `checkPublishFlowModal` uses an early return instead of wrapping everything in an `if` block.
- `fetchPostCountTask` uses an early return for the `emailOnly` guard.

### 4. Extracted Private Helpers
- `_snapshotCounts()` / `_restoreCounts()` replace 10 lines of repetitive assignments in `fetchPostTask`.
- `_hasCountChanged()` and `_animateElement()` decompose `applyClasses` into focused, testable units.
- `_linksUrl` getter deduplicates the URL construction used in both `_fetchLinks` and `_refreshLinks`.
- `_refreshLinks()` extracts the post-update link refresh from `_updateLinks`.

### 5. Fixed a Bug
- `isLoaded` referenced `this.souces` (typo) — corrected to `this.sources`.
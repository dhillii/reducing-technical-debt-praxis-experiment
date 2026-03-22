# Refactored MembersController

## Key Refactoring Decisions

1. **Extracted bulk modal operations** into a reusable helper method
2. **Extracted filter state management** into dedicated methods
3. **Simplified `getApiQueryObject`** by extracting filter normalization
4. **Simplified `filterColumns`** by extracting column mapping logic
5. **Extracted export logic** into a dedicated method
6. **Simplified `isBulkDeletePermitted`** with a constant
7. **Reduced repetition** in filter reset actions

```javascript
import BulkAddMembersLabelModal from '../components/members/modals/bulk-add-label';
import BulkDeleteMembersModal from '../components/members/modals/bulk-delete';
import BulkRemoveMembersLabelModal from '../components/members/modals/bulk-remove-label';
import BulkUnsubscribeMembersModal from '../components/members/modals/bulk-unsubscribe';
import Controller from '@ember/controller';
import fetch from 'fetch';
import ghostPaths from 'ghost-admin/utils/ghost-paths';
import moment from 'moment-timezone';
import {A} from '@ember/array';
import {action} from '@ember/object';
import {didCancel, task, timeout} from 'ember-concurrency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject} from 'ghost-admin/decorators/inject';
import {resetQueryParams} from 'ghost-admin/helpers/reset-query-params';
import {inject as service} from '@ember/service';
import {tracked} from '@glimmer/tracking';

const PAID_PARAMS = [
    {name: 'All members', value: null},
    {name: 'Free members', value: 'false'},
    {name: 'Paid members', value: 'true'}
];

const STRIPE_FILTER_TYPES = new Set([
    'subscriptions.plan_interval',
    'subscriptions.status',
    'subscriptions.start_date',
    'subscriptions.current_period_end',
    'conversion',
    'offer_redemptions'
]);

const MAX_FILTER_COLUMNS = 2;

export default class MembersController extends Controller {
    @service ajax;
    @service ellaSparse;
    @service feature;
    @service ghostPaths;
    @service membersStats;
    @service modals;
    @service router;
    @service store;
    @service utils;
    @service settings;

    @inject config;

    queryParams = [
        'label',
        {paidParam: 'paid'},
        {searchParam: 'search'},
        {orderParam: 'order'},
        {filterParam: 'filter'},
        {postAnalytics: 'post'}
    ];

    @tracked members = A([]);
    @tracked searchParam = '';
    @tracked searchIsFocused = false;
    @tracked filterParam = null;
    @tracked softFilterParam = null;
    @tracked paidParam = null;
    @tracked label = null;
    @tracked orderParam = null;
    @tracked modalLabel = null;
    @tracked showLabelModal = false;
    @tracked filters = A([]);
    @tracked softFilters = A([]);
    @tracked isExporting = false;
    @tracked _availableLabels = A([]);
    @tracked parseFilterParamCounter = 0;

    /** Flag used to determine if we should return to the analytics page */
    @tracked postAnalytics = null;

    paidParams = PAID_PARAMS;

    constructor() {
        super(...arguments);
        this._availableLabels = this.store.peekAll('label');
    }

    // Computed properties -----------------------------------------------------

    get fromAnalytics() {
        return this.postAnalytics ? [this.postAnalytics] : null;
    }

    get listHeader() {
        const {searchParam, selectedLabel, members} = this;

        if (members.loading) {
            return 'Loading...';
        }

        if (searchParam) {
            return 'Search result';
        }

        const count = ghPluralize(members.length, 'member');

        if (selectedLabel?.slug) {
            return `${count} ${members.length > 1 ? 'match' : 'matches'} current filter`;
        }

        return count;
    }

    get hideSearchBar() {
        return !this.members.length && !this.searchParam && !this.searchIsFocused;
    }

    get showingAll() {
        return !this.searchParam && !this.paidParam && !this.label
            && !this.filterParam && !this.softFilterParam;
    }

    get availableOrders() {
        if (!this.feature.get('emailAnalytics')) {
            return [];
        }

        return [
            {name: 'Newest', value: null},
            {name: 'Open rate', value: 'email_open_rate'}
        ];
    }

    get selectedOrder() {
        return this.availableOrders.find(order => order.value === this.orderParam);
    }

    get availableLabels() {
        const sorted = this._availableLabels
            .filter(label => !label.isNew && label.id !== null)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {ignorePunctuation: true}));

        return [{name: 'All labels', slug: null}, ...sorted.toArray()];
    }

    get selectedLabel() {
        return this.availableLabels.findBy('slug', this.label);
    }

    get labelModalData() {
        return {
            label: this.modalLabel,
            labels: this.availableLabels
        };
    }

    get selectedPaidParam() {
        return this.paidParams.findBy('value', this.paidParam) || {value: '!unknown'};
    }

    get isFiltered() {
        return !!(this.label || this.paidParam || this.searchParam || this.filterParam);
    }

    get availableFilters() {
        return this.softFilters.length ? this.softFilters : this.filters;
    }

    get filterColumns() {
        const columns = this.availableFilters.flatMap(filter => this._getColumnsForFilter(filter));

        const uniqueColumns = columns.filter((col, i) => (
            columns.findIndex(c => c.label === col.label) === i
        ));

        return uniqueColumns.slice(0, MAX_FILTER_COLUMNS);
    }

    /*
     * Due to a limitation with NQL, member bulk deletion is not permitted if any of the following
     * Stripe subscription filters is used: Billing period, Stripe subscription status, Paid start
     * date, Next billing date, Subscription started on post/page, Offers.
     *
     * See: https://linear.app/tryghost/issue/ENG-1484
     */
    get isBulkDeletePermitted() {
        return this.isFiltered
            && !this.filters.some(f => STRIPE_FILTER_TYPES.has(f.type));
    }

    // Private helpers ---------------------------------------------------------

    _getColumnsForFilter(filter) {
        if (filter.properties?.getColumns) {
            return filter.properties.getColumns(filter).map(col => ({
                label: filter.properties.columnLabel,
                ...col,
                name: filter.type
            }));
        }

        if (filter.properties?.columnLabel) {
            return [{
                name: filter.type,
                label: filter.properties.columnLabel,
                getValue: filter.properties.getColumnValue
                    ? member => filter.properties.getColumnValue(member, filter)
                    : null
            }];
        }

        return [];
    }

    _normalizeFilterParam(filterParam) {
        if (!filterParam) {
            return filterParam;
        }

        const BRACKETS_SURROUNDED_RE = /^\(.*\)$/;
        const MULTIPLE_GROUPS_RE = /\).*\(/;

        if (BRACKETS_SURROUNDED_RE.test(filterParam) && !MULTIPLE_GROUPS_RE.test(filterParam)) {
            return filterParam.slice(1, -1);
        }

        return filterParam;
    }

    _buildFiltersArray({label, paidParam, filterParam}) {
        const filters = [];

        if (label) {
            filters.push(`label:'${label}'`);
        }

        if (paidParam !== null) {
            filters.push(paidParam === 'true' ? 'status:-free' : 'status:free');
        }

        if (filterParam) {
            filters.push(filterParam);
        }

        return filters;
    }

    _clearSoftFilters() {
        this.softFilters = A([]);
        this.softFilterParam = null;
    }

    _openBulkModal(ModalComponent, additionalData = {}) {
        this.modals.open(ModalComponent, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers,
            ...additionalData
        });
    }

    _triggerExportDownload(blob) {
        const blobUrl = window.URL.createObjectURL(blob);
        const datetime = new Date().toJSON().substring(0, 10);
        const a = document.createElement('a');

        a.href = blobUrl;
        a.download = `members.${datetime}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
    }

    // Public methods ----------------------------------------------------------

    includeTierQuery() {
        const activeFilters = this.filters.length ? this.filters : this.softFilters;
        return activeFilters.some(f => f.type === 'tier');
    }

    getApiQueryObject({params, extraFilters = []} = {}) {
        let {label, paidParam, searchParam, filterParam} = params ?? this;

        filterParam = this._normalizeFilterParam(filterParam);

        const filters = [
            ...extraFilters,
            ...this._buildFiltersArray({label, paidParam, filterParam})
        ];

        const searchQuery = searchParam ? {search: searchParam} : {};

        return Object.assign({}, {filter: filters.join('+')}, searchQuery);
    }

    // Actions -----------------------------------------------------------------

    @action
    refreshData() {
        try {
            this.fetchMembersTask.perform();
            this.fetchLabelsTask.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }

        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.membersStats.fetchMemberCount();
    }

    @action
    changeOrder(order) {
        this.orderParam = order.value;
    }

    @action
    applyFilter(filterStr, filters) {
        this._clearSoftFilters();
        this.filterParam = filterStr || null;
        this.filters = filters;
    }

    @action
    applyParsedFilter(filters) {
        this._clearSoftFilters();
        this.filters = filters;
    }

    @action
    applySoftFilter(filterStr, filters) {
        this.softFilters = filters;
        this.softFilterParam = filterStr || null;

        const {label, paidParam, searchParam, orderParam} = this;
        this.fetchMembersTask.perform({label, paidParam, searchParam, orderParam, filterParam: filterStr});
    }

    @action
    resetSoftFilter() {
        if (this.softFilters.length > 0 || this.softFilterParam) {
            this._clearSoftFilters();
            this.fetchMembersTask.perform();
        }
    }

    @action
    resetFilter() {
        this._clearSoftFilters();
        this.filters = A([]);
        this.filterParam = null;
        this.fetchMembersTask.perform();
    }

    @action
    search(e) {
        this.searchTask.perform(e.target.value);
    }

    @action
    exportData() {
        const exportUrl = ghostPaths().url.api('members/upload');
        const downloadParams = new URLSearchParams(this.getApiQueryObject());
        downloadParams.set('limit', 'all');

        this.isExporting = true;

        fetch(`${exportUrl}?${downloadParams.toString()}`, {method: 'GET'})
            .then(res => res.blob())
            .then(blob => this._triggerExportDownload(blob))
            .finally(() => {
                this.isExporting = false;
            });
    }

    @action
    changeLabel(label, e) {
        e?.preventDefault();
        e?.stopPropagation();
        this.label = label.slug;
    }

    @action
    editLabel(label, e) {
        e?.preventDefault();
        e?.stopPropagation();
        this.modalLabel = this.availableLabels.findBy('slug', label);
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    toggleLabelModal() {
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    bulkAddLabel() {
        this._openBulkModal(BulkAddMembersLabelModal);
    }

    @action
    bulkRemoveLabel() {
        this._openBulkModal(BulkRemoveMembersLabelModal);
    }

    @action
    bulkUnsubscribe() {
        this._openBulkModal(BulkUnsubscribeMembersModal);
    }

    @action
    resetAndReloadMembers() {
        this.store.unloadAll('member');
        this.reload();
    }

    @action
    bulkDelete() {
        this.modals.open(BulkDeleteMembersModal, {
            query: this.getApiQueryObject(),
            onComplete: () => {
                this.store.unloadAll('member');
                this.router.transitionTo('members.index', {
                    queryParams: Object.assign(resetQueryParams('members.index'))
                });
                this.membersStats.invalidate();
                this.membersStats.fetchCounts();
            }
        });
    }

    @action
    changePaidParam(paid) {
        this.paidParam = paid.value;
    }

    // Tasks -------------------------------------------------------------------

    @task({restartable: true})
    *searchTask(query) {
        yield timeout(250);
        this.searchParam = query;
    }

    @task({restartable: true})
    *fetchLabelsTask() {
        yield this.store.query('label', {limit: 'all'});
    }

    @task({restartable: true})
    *fetchMembersTask(params) {
        const {label, paidParam, searchParam, orderParam, filterParam} = params ?? this;
        const startDate = new Date();

        const forceReload = !params
            || label !== this._lastLabel
            || paidParam !== this._lastPaidParam
            || searchParam !== this._lastSearchParam
            || orderParam !== this._lastOrderParam
            || filterParam !== this._lastFilterParam;

        Object.assign(this, {
            _lastLabel: label,
            _lastPaidParam: paidParam,
            _lastSearchParam: searchParam,
            _lastOrderParam: orderParam,
            _lastFilterParam: filterParam
        });

        const cacheIsValid = !forceReload
            && this._startDate
            && !(this._startDate - startDate > 60 * 1000);

        if (cacheIsValid) {
            return this.members;
        }

        this._startDate = startDate;

        this.members = yield this.ellaSparse.array((range = {}, query = {}) => {
            const searchQuery = this.getApiQueryObject({
                params,
                extraFilters: [
                    `created_at:<='${moment.utc(this._startDate).format('YYYY-MM-DD HH:mm:ss')}'`
                ]
            });

            query = Object.assign({
                include: 'labels,tiers',
                order: orderParam ? `${orderParam} desc` : 'created_at desc',
                limit: range.length,
                page: range.page
            }, searchQuery, query);

            return this.store.query('member', query).then(result => ({
                data: result,
                total: result.meta.pagination.total
            }));
        }, {limit: 50});
    }

    // Internal ----------------------------------------------------------------

    resetFilters(params) {
        if (!params?.filterParam) {
            this.filters = A([]);
            this._clearSoftFilters();
        } else {
            this.filterParam = params.filterParam;
            this.parseFilterParamCounter += 1;
        }
    }

    reload(params) {
        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.fetchMembersTask.perform(params);
    }
}
```

## Summary of Changes

| Area | Change |
|------|--------|
| `STRIPE_FILTER_TYPES` | Extracted to a `Set` constant for O(1) lookup and single source of truth |
| `isBulkDeletePermitted` | Simplified to a one-liner using `Set.has()` |
| `_getColumnsForFilter` | Extracted from `filterColumns` getter to reduce nesting |
| `_normalizeFilterParam` | Extracted filter param normalization from `getApiQueryObject` |
| `_buildFiltersArray` | Extracted filter array construction from `getApiQueryObject` |
| `_clearSoftFilters` | Eliminated repeated `softFilters`/`softFilterParam` reset pairs |
| `_openBulkModal` | Eliminated 3 near-identical bulk modal action bodies |
| `_triggerExportDownload` | Extracted DOM manipulation from `exportData` |
| `fromAnalytics` | Simplified with ternary |
| `listHeader` | Simplified plural/singular with ternary |
| `availableLabels` | Merged two `.filter()` calls; used spread instead of `unshiftObject` |
| `fetchMembersTask` | Used `Object.assign` for cache tracking; extracted cache validity check |
| `e?.preventDefault()` | Used optional chaining instead of `if (e)` guards |
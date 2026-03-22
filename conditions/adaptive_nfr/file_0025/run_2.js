# Refactored MembersController

## Key Refactoring Decisions

1. **Extracted bulk modal action pattern** - The four bulk actions shared identical structure
2. **Extracted event prevention helper** - `changeLabel` and `editLabel` shared the same guard pattern
3. **Extracted filter reset logic** - Repeated `A([])` reset patterns consolidated
4. **Simplified `filterColumns`** - Extracted column mapping helpers
5. **Simplified `isBulkDeletePermitted`** - Extracted the restricted filter types as a constant
6. **Simplified `getApiQueryObject`** - Extracted filter normalization
7. **Simplified `fetchMembersTask`** - Extracted stale-check and param-tracking logic

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

const BULK_DELETE_RESTRICTED_FILTERS = new Set([
    'subscriptions.plan_interval',
    'subscriptions.status',
    'subscriptions.start_date',
    'subscriptions.current_period_end',
    'conversion',
    'offer_redemptions'
]);

const CACHE_TTL_MS = 1 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 250;
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
        const unique = columns.filter((col, i) => columns.findIndex(c => c.label === col.label) === i);
        return unique.slice(0, MAX_FILTER_COLUMNS);
    }

    /*
     * Bulk deletion is not permitted when Stripe subscription filters are active
     * due to NQL limitations. See: ENG-1484, ENG-1466
     */
    get isBulkDeletePermitted() {
        return this.isFiltered
            && !this.filters.some(f => BULK_DELETE_RESTRICTED_FILTERS.has(f.type));
    }

    // Private helpers ---------------------------------------------------------

    _getColumnsForFilter(filter) {
        const {properties, type} = filter;

        if (properties?.getColumns) {
            return properties.getColumns(filter).map(col => ({
                label: properties.columnLabel,
                ...col,
                name: type
            }));
        }

        if (properties?.columnLabel) {
            return [{
                name: type,
                label: properties.columnLabel,
                getValue: properties.getColumnValue
                    ? member => properties.getColumnValue(member, filter)
                    : null
            }];
        }

        return [];
    }

    _clearSoftFilters() {
        this.softFilters = A([]);
        this.softFilterParam = null;
    }

    _clearAllFilters() {
        this._clearSoftFilters();
        this.filters = A([]);
        this.filterParam = null;
    }

    _preventEventBubbling(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    _normalizeFilterParam(filterParam) {
        if (!filterParam) {
            return filterParam;
        }

        // Remove surrounding brackets for single filters to prevent NQL issue #16
        const isBracketSurrounded = /^\(.*\)$/.test(filterParam);
        const hasMultipleGroups = /\).*\(/.test(filterParam);

        return (isBracketSurrounded && !hasMultipleGroups)
            ? filterParam.slice(1, -1)
            : filterParam;
    }

    _openBulkModal(ModalComponent, extraData = {}) {
        this.modals.open(ModalComponent, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers,
            ...extraData
        });
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
            label && `label:'${label}'`,
            paidParam === 'true' && 'status:-free',
            paidParam === 'false' && 'status:free',
            filterParam
        ].filter(Boolean);

        return Object.assign(
            {filter: filters.join('+')},
            searchParam ? {search: searchParam} : {}
        );
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
    changePaidParam(paid) {
        this.paidParam = paid.value;
    }

    @action
    changeLabel(label, e) {
        this._preventEventBubbling(e);
        this.label = label.slug;
    }

    @action
    editLabel(label, e) {
        this._preventEventBubbling(e);
        this.modalLabel = this.availableLabels.findBy('slug', label);
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    toggleLabelModal() {
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    search(e) {
        this.searchTask.perform(e.target.value);
    }

    /** Apply filters from the filter editor (commits to URL) */
    @action
    applyFilter(filterStr, filters) {
        this._clearSoftFilters();
        this.filterParam = filterStr || null;
        this.filters = filters;
    }

    /** Apply parsed filters after URL filterParam is re-parsed */
    @action
    applyParsedFilter(filters) {
        this._clearSoftFilters();
        this.filters = filters;
    }

    /** Preview filters while editing, without committing to URL */
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
        this._clearAllFilters();
        this.fetchMembersTask.perform();
    }

    @action
    exportData() {
        const exportUrl = ghostPaths().url.api('members/upload');
        const downloadParams = new URLSearchParams(this.getApiQueryObject());
        downloadParams.set('limit', 'all');

        this.isExporting = true;

        fetch(`${exportUrl}?${downloadParams.toString()}`, {method: 'GET'})
            .then(res => res.blob())
            .then((blob) => {
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `members.${new Date().toJSON().substring(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(blobUrl);
            })
            .finally(() => {
                this.isExporting = false;
            });
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

    // Tasks -------------------------------------------------------------------

    @task({restartable: true})
    *searchTask(query) {
        yield timeout(SEARCH_DEBOUNCE_MS);
        this.searchParam = query;
    }

    @task({restartable: true})
    *fetchLabelsTask() {
        yield this.store.query('label', {limit: 'all'});
    }

    @task({restartable: true})
    *fetchMembersTask(params) {
        const resolved = params ?? this;
        const {label, paidParam, searchParam, orderParam, filterParam} = resolved;
        const startDate = new Date();

        if (!this._haveParamsChanged(label, paidParam, searchParam, orderParam, filterParam)
            && this._isCacheValid(startDate)) {
            return this.members;
        }

        this._updateParamCache(label, paidParam, searchParam, orderParam, filterParam);
        this._startDate = startDate;

        this.members = yield this.ellaSparse.array((range = {}, query = {}) => {
            const searchQuery = this.getApiQueryObject({
                params,
                extraFilters: [
                    `created_at:<='${moment.utc(this._startDate).format('YYYY-MM-DD HH:mm:ss')}'`
                ]
            });

            return this.store.query('member', Object.assign({
                include: 'labels,tiers',
                order: orderParam ? `${orderParam} desc` : 'created_at desc',
                limit: range.length,
                page: range.page
            }, searchQuery, query)).then(result => ({
                data: result,
                total: result.meta.pagination.total
            }));
        }, {limit: 50});
    }

    // Internal ----------------------------------------------------------------

    _haveParamsChanged(label, paidParam, searchParam, orderParam, filterParam) {
        return label !== this._lastLabel
            || paidParam !== this._lastPaidParam
            || searchParam !== this._lastSearchParam
            || orderParam !== this._lastOrderParam
            || filterParam !== this._lastFilterParam;
    }

    _isCacheValid(now) {
        return this._startDate && !(this._startDate - now > CACHE_TTL_MS);
    }

    _updateParamCache(label, paidParam, searchParam, orderParam, filterParam) {
        this._lastLabel = label;
        this._lastPaidParam = paidParam;
        this._lastSearchParam = searchParam;
        this._lastOrderParam = orderParam;
        this._lastFilterParam = filterParam;
    }

    resetFilters(params) {
        if (!params?.filterParam) {
            this._clearAllFilters();
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

| Area | Before | After |
|------|--------|-------|
| **Bulk actions** | 4 near-identical `modals.open(...)` blocks | `_openBulkModal()` helper; 3 actions become one-liners |
| **Event prevention** | Duplicated `if (e) { e.preventDefault(); e.stopPropagation() }` | `_preventEventBubbling(e)` helper |
| **Filter reset** | Repeated `A([])` assignments scattered across 4 actions | `_clearSoftFilters()` / `_clearAllFilters()` helpers |
| **`getApiQueryObject`** | Imperative push-based filter building | Declarative array with `.filter(Boolean)` |
| **`filterParam` normalization** | Inline regex logic inside `getApiQueryObject` | `_normalizeFilterParam()` helper |
| **`isBulkDeletePermitted`** | Verbose `.filter()` + length check | `Set.has()` with `.some()` |
| **`fetchMembersTask`** | Monolithic with inline stale/param logic | Extracted `_haveParamsChanged`, `_isCacheValid`, `_updateParamCache` |
| **`filterColumns`** | Inline complex flatMap | `_getColumnsForFilter()` helper |
| **Magic values** | Inline `250`, `1 * 60 * 1000`, `2` | Named constants `SEARCH_DEBOUNCE_MS`, `CACHE_TTL_MS`, `MAX_FILTER_COLUMNS` |
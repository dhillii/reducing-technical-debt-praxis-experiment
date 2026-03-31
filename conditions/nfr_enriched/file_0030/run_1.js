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

const PAID_PARAMS = [{
    name: 'All members',
    value: null
}, {
    name: 'Free members',
    value: 'false'
}, {
    name: 'Paid members',
    value: 'true'
}];

const STRIPE_FILTER_TYPES = [
    'subscriptions.plan_interval',
    'subscriptions.status',
    'subscriptions.start_date',
    'subscriptions.current_period_end',
    'conversion',
    'offer_redemptions'
];

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

    /**
     * Flag used to determine if we should return to the analytics page
     */
    @tracked postAnalytics = null;

    get fromAnalytics() {
        if (!this.postAnalytics) {
            return null;
        }
        return [this.postAnalytics];
    }

    paidParams = PAID_PARAMS;

    constructor() {
        super(...arguments);
        this._availableLabels = this.store.peekAll('label');
    }

    // Computed properties -----------------------------------------------------

    get listHeader() {
        let {searchParam, selectedLabel, members} = this;

        if (members.loading) {
            return 'Loading...';
        }

        if (searchParam) {
            return 'Search result';
        }

        let count = ghPluralize(members.length, 'member');

        if (selectedLabel && selectedLabel.slug) {
            if (members.length > 1) {
                return `${count} match current filter`;
            } else {
                return `${count} matches current filter`;
            }
        }

        return count;
    }

    get hideSearchBar() {
        return !this.members.length
            && !this.searchParam
            && !this.searchIsFocused;
    }

    get showingAll() {
        return !this.searchParam && !this.paidParam && !this.label && !this.filterParam && !this.softFilterParam;
    }

    get availableOrders() {
        // don't return anything if email analytics is disabled because
        // we don't want to show an order dropdown with only a single option

        if (this.feature.get('emailAnalytics')) {
            return [{
                name: 'Newest',
                value: null
            }, {
                name: 'Open rate',
                value: 'email_open_rate'
            }];
        }

        return [];
    }

    get selectedOrder() {
        return this.availableOrders.find(order => order.value === this.orderParam);
    }

    get availableLabels() {
        let labels = this._availableLabels
            .filter(label => !label.isNew)
            .filter(label => label.id !== null)
            .sort((labelA, labelB) => labelA.name.localeCompare(labelB.name, undefined, {ignorePunctuation: true}));
        let options = labels.toArray();

        options.unshiftObject({name: 'All labels', slug: null});

        return options;
    }

    get selectedLabel() {
        let {label, availableLabels} = this;
        return availableLabels.findBy('slug', label);
    }

    get labelModalData() {
        let label = this.modalLabel;
        let labels = this.availableLabels;

        return {
            label,
            labels
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
        const columns = this.availableFilters.flatMap((filter) => {
            if (filter.properties?.getColumns) {
                return filter.properties?.getColumns(filter).map((c) => {
                    return {
                        label: filter.properties.columnLabel,
                        ...c,
                        name: filter.type
                    };
                });
            }
            if (filter.properties?.columnLabel) {
                return [
                    {
                        name: filter.type,
                        label: filter.properties.columnLabel,
                        getValue: filter.properties.getColumnValue ? (member => filter.properties.getColumnValue(member, filter)) : null
                    }
                ];
            }
            return [];
        });
        // Remove duplicates by label
        const uniqueColumns = columns.filter((c, i) => {
            return columns.findIndex(c2 => c2.label === c.label) === i;
        });
        return uniqueColumns.splice(0, 2); // Maximum 2 columns
    }

    /*
     * Due to a limitation with NQL, member bulk deletion is not permitted if any of the following Stripe subscription filters is used:
     *     - Billing period
     *     - Stripe subscription status
     *     - Paid start date
     *     - Next billing date
     *     - Subscription started on post/page
     *     - Offers
     *
     * For more context, see:
     * - https://linear.app/tryghost/issue/ENG-1484
     * - https://linear.app/tryghost/issue/ENG-1466
     */
    get isBulkDeletePermitted() {
        if (!this.isFiltered) {
            return false;
        }

        const stripeFilters = this.filters.filter(f => STRIPE_FILTER_TYPES.includes(f.type));

        return stripeFilters.length === 0;
    }

    includeTierQuery() {
        const availableFilters = this.filters.length ? this.filters : this.softFilters;
        return availableFilters.some((f) => {
            return f.type === 'tier';
        });
    }

    // Query building ----------------------------------------------------------

    /**
     * Normalizes filter parameter by removing surrounding brackets if it's a single filter
     */
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

    /**
     * Builds filter array from label, paid status, and filter parameters
     */
    _buildFilterArray(label, paidParam, filterParam, extraFilters = []) {
        let filters = [...extraFilters];

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

    /**
     * Builds search query object from search parameter
     */
    _buildSearchQuery(searchParam) {
        return searchParam ? {search: searchParam} : {};
    }

    getApiQueryObject({params, extraFilters = []} = {}) {
        let {label, paidParam, searchParam, filterParam} = params ? params : this;

        filterParam = this._normalizeFilterParam(filterParam);
        const filters = this._buildFilterArray(label, paidParam, filterParam, extraFilters);
        const searchQuery = this._buildSearchQuery(searchParam);

        return {
            filter: filters.join('+'),
            ...searchQuery
        };
    }

    // Actions -----------------------------------------------------------------

    @action
    refreshData() {
        try {
            this.fetchMembersTask.perform();
            this.fetchLabelsTask.perform();
        } catch (e) {
            // Do not throw cancellation errors
            if (didCancel(e)) {
                return;
            }

            throw e;
        }

        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.membersStats.fetchMemberCount();
    }

    @action
    changeOrder(order) {
        this.orderParam = order.value;
    }

    /**
     * A user clicked 'Apply filters' when editing the filter
     */
    @action
    applyFilter(filterStr, filters) {
        this.softFilters = A([]);
        this.filterParam = filterStr || null;
        this.filters = filters;
    }

    /**
     * Called to set the filters after the url filterParam has been parsed again
     */
    @action
    applyParsedFilter(filters) {
        this.softFilters = A([]);
        this.filters = filters;
    }

    /**
     * Already start filtering when the user is editing a filter, without applying it to the URL yet,
     * and to still allow a cancel action to revert to the previous filters.
     */
    @action
    applySoftFilter(filterStr, filters) {
        this.softFilters = filters;
        this.softFilterParam = filterStr || null;
        let {label, paidParam, searchParam, orderParam} = this;
        this.fetchMembersTask.perform({label, paidParam, searchParam, orderParam, filterParam: filterStr});
    }

    @action
    resetSoftFilter() {
        if (this.softFilters.length > 0 || !!this.softFilterParam) {
            this.softFilters = A([]);
            this.softFilterParam = null;
            this.fetchMembersTask.perform();
        }
    }

    @action
    resetFilter() {
        this.softFilters = A([]);
        this.softFilterParam = null;
        this.filters = A([]);
        this.filterParam = null;
        this.fetchMembersTask.perform();
    }

    @action
    search(e) {
        this.searchTask.perform(e.target.value);
    }

    /**
     * Handles the export data action by fetching members as CSV and triggering download
     */
    @action
    exportData() {
        let exportUrl = ghostPaths().url.api('members/upload');
        let downloadParams = new URLSearchParams(this.getApiQueryObject());
        downloadParams.set('limit', 'all');
        
        const url = `${exportUrl}?${downloadParams.toString()}`;
        
        this.isExporting = true;
        
        fetch(url, {method: 'GET'})
            .then(res => res.blob())
            .then((blob) => {
                this._downloadBlob(blob);
            })
            .catch(() => {
                // Handle errors silently
            })
            .finally(() => {
                this.isExporting = false;
            });
    }

    /**
     * Creates and triggers download of a blob with members CSV filename
     */
    _downloadBlob(blob) {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        const datetime = (new Date()).toJSON().substring(0, 10);
        
        link.href = blobUrl;
        link.download = `members.${datetime}.csv`;
        document.body.appendChild(link);
        
        link.click();
        
        link.remove();
        URL.revokeObjectURL(blobUrl);
    }

    @action
    changeLabel(label, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        this.label = label.slug;
    }

    @action
    editLabel(label, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        let modalLabel = this.availableLabels.findBy('slug', label);
        this.modalLabel = modalLabel;
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    toggleLabelModal() {
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    bulkAddLabel() {
        this.modals.open(BulkAddMembersLabelModal, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
        });
    }

    @action
    bulkRemoveLabel() {
        this.modals.open(BulkRemoveMembersLabelModal, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
        });
    }

    @action
    bulkUnsubscribe() {
        this.modals.open(BulkUnsubscribeMembersModal, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
        });
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
                this._completeBulkDelete();
            }
        });
    }

    /**
     * Handles post-bulk-delete cleanup: unload members, reset filters, and reload counts
     */
    _completeBulkDelete() {
        this.store.unloadAll('member');
        this.router.transitionTo('members.index', {queryParams: {...resetQueryParams('members.index')}});
        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
    }

    @action
    changePaidParam(paid) {
        this.paidParam = paid.value;
// ...

getApiQueryObject({params, extraFilters = []} = {}) {
    let {label, paidParam, searchParam, filterParam} = params ? params : this;

    if (filterParam) {
        // If the provided filter param is a single filter related to newsletter subscription status
        // remove the surrounding brackets to prevent https://github.com/TryGhost/NQL/issues/16
        const BRACKETS_SURROUNDED_RE = /^\(.*\)$/;
        const MULTIPLE_GROUPS_RE = /\).*\(/;

        if (BRACKETS_SURROUNDED_RE.test(filterParam) && !MULTIPLE_GROUPS_RE.test(filterParam)) {
            filterParam = filterParam.slice(1, -1);
        }
    }

    let filters = [];

    filters = filters.concat(extraFilters);

    if (label) {
        filters.push(`label:'${label}'`);
    }

    if (paidParam !== null) {
        if (paidParam === 'true') {
            filters.push('status:-free');
        } else {
            filters.push('status:free');
        }
    }
    if (filterParam) {
        filters.push(filterParam);
    }

    let searchQuery = searchParam ? {search: searchParam} : {};

    return {...{filter: filters.join('+')}, ...searchQuery};
}

// ...
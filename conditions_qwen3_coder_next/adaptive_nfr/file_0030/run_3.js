let searchQuery = searchParam ? {search: searchParam} : {};

        return {...{filter: filters.join('+')}, ...searchQuery};
    }
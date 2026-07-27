const combineFilters = params => {
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = {
      _and: params.mime_ncontains.map(val => ({ mime_ncontains: val })),
    };
    delete params.mime_ncontains;
  }
};
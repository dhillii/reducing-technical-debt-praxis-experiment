const combineFilters = params => {
  // Replace the FIXME comment with a more descriptive comment
  // until we support boolean operators for querying, 
  // we need to make mime_ncontains use AND instead of OR
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    // Create a new _where object with mime_ncontains conditions
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    // Remove the mime_ncontains property from the params object
    delete params.mime_ncontains;
  }
  return params;
};
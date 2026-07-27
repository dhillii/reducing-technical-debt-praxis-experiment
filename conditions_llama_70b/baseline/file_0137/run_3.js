const combineFilters = params => {
  // Replace the FIXME comment with a clear explanation of the logic
  // We are using AND instead of OR for mime_ncontains due to the current limitation in querying
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
  return params;
};
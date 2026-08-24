const applyMimeNcontainsFilter = params => {
  // FIXME: until we support boolean operators for querying we need to make mime_ncontains use AND instead of OR
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

const applyCombinedFilters = params => {
  applyMimeNcontainsFilter(params);
};

const prepareFileValues = (values, user) => {
  const fileValues = { ...values };
  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    if (!values[CREATED_BY_ATTRIBUTE]) {
      fileValues[CREATED_BY_ATTRIBUTE] = user.id;
    }
  }
  return fileValues;
};

const emitMediaEvent = (event, media) => {
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(event, { media: sanitizeEntity(media, { model: modelDef }) });
};

const clearEntityBuffer = entity => {
  delete entity.buffer;
  return entity;
};

const uploadFormatFiles = async (formats, fileData) => {
  if (!Array.isArray(formats) || formats.length === 0) return;

  for (const format of formats) {
    if (!format) continue;

    const { key, file } = format;
    await strapi.plugins.upload.provider.upload(file);
    delete file.buffer;
    _.set(fileData, ['formats', key], file);
  }
};

const uploadFormatsAndGenerateDimensions = async (fileData, config) => {
  const { getDimensions, generateThumbnail, generateResponsiveFormats } =
    strapi.plugins.upload.services['image-manipulation'];

  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }

  const formats = await generateResponsiveFormats(fileData);
  await uploadFormatFiles(formats, fileData);

  const { width, height } = await getDimensions(fileData.buffer);
  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });
  clearEntityBuffer(fileData);
};

const persistFileAndEmit = async (operation, fileData, { user } = {}) => {
  const preparedData = prepareFileValues(fileData, user);
  sendMediaMetrics(preparedData);

  const modelDef = strapi.getModel('file', 'upload');
  const res = await strapi.query('file', 'upload')[operation](preparedData);
  emitMediaEvent(operation === 'create' ? MEDIA_CREATE : MEDIA_UPDATE, res);

  return res;
};

const deleteFormatFiles = async (file, provider) => {
  if (!file.formats) return;

  await Promise.all(
    Object.keys(file.formats).map(key => provider.delete(file.formats[key]))
  );
};

const executeProviderDelete = async (file, config) => {
  if (file.provider !== config.provider) return;

  await strapi.plugins.upload.provider.delete(file);
  await deleteFormatFiles(file, strapi.plugins.upload.provider);
};

const mapUploadFileData = async (file, fileInfo) => {
  const fileData = await this.enhanceFile(file, fileInfo, {});
  return this.uploadFileAndPersist(fileData, {});
};

module.exports = {
  formatFileInfo({ filename, type, size }, fileInfo = {}, metas = {}) {
    const ext = path.extname(filename);
    const basename = path.basename(fileInfo.name || filename, ext);
    const usedName = fileInfo.name || filename;

    const entity = {
      name: usedName,
      alternativeText: fileInfo.alternativeText,
      caption: fileInfo.caption,
      hash: generateFileName(basename),
      ext,
      mime: type,
      size: bytesToKbytes(size),
    };

    const { refId, ref, source, field } = metas;
    if (refId && ref && field) {
      entity.related = [{ refId, ref, source, field }];
    }
    if (metas.path) {
      entity.path = metas.path;
    }

    return entity;
  },

  async enhanceFile(file, fileInfo = {}, metas = {}) {
    let readBuffer;
    try {
      readBuffer = await util.promisify(fs.readFile)(file.path);
    } catch (e) {
      if (e.code === 'ERR_FS_FILE_TOO_LARGE') {
        throw strapi.errors.entityTooLarge('FileTooBig', {
          errors: [
            {
              id: 'Upload.status.sizeLimit',
              message: `${file.name} file is bigger than the limit size!`,
              values: { file: file.name },
            },
          ],
        });
      }
      throw e;
    }

    const { optimize } = strapi.plugins.upload.services['image-manipulation'];
    const { buffer, info } = await optimize(readBuffer);

    const formattedFile = this.formatFileInfo(
      { filename: file.name, type: file.type, size: file.size },
      fileInfo,
      metas
    );

    return _.assign(formattedFile, info, { buffer });
  },

  async upload({ data, files }, { user } = {}) {
    const { fileInfo, ...metas } = data;
    const fileArray = Array.isArray(files) ? files : [files];
    const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

    const promises = fileArray.map((file, idx) => {
      return this.uploadFileAndPersist(
        await this.enhanceFile(file, fileInfoArray[idx] || {}, metas),
        { user }
      );
    });

    return await Promise.all(promises);
  },

  async uploadFileAndPersist(fileData, { user } = {}) {
    const config = strapi.plugins.upload.config;
    await strapi.plugins.upload.provider.upload(fileData);

    await uploadFormatsAndGenerateDimensions(fileData, config);
    return persistFileAndEmit('create', fileData, { user });
  },

  async updateFileInfo(id, { name, alternativeText, caption }, { user } = {}) {
    const dbFile = await this.fetch({ id });
    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const newInfos = {
      name: _.isNil(name) ? dbFile.name : name,
      alternativeText: _.isNil(alternativeText) ? dbFile.alternativeText : alternativeText,
      caption: _.isNil(caption) ? dbFile.caption : caption,
    };

    return this.update({ id }, newInfos, { user });
  },

  async replace(id, { data, file }, { user } = {}) {
    const config = strapi.plugins.upload.config;
    const dbFile = await this.fetch({ id });

    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const { fileInfo } = data;
    const fileData = await this.enhanceFile(file, fileInfo);

    _.assign(fileData, {
      hash: dbFile.hash,
      ext: dbFile.ext,
    });

    if (dbFile.provider === config.provider) {
      await executeProviderDelete(dbFile, config);
    }

    await strapi.plugins.upload.provider.upload(fileData);
    _.set(fileData, 'formats', {});

    await uploadFormatsAndGenerateDimensions(fileData, config);
    return persistFileAndEmit('update', fileData, { user });
  },

  async update(params, values, { user } = {}) {
    const fileValues = prepareFileValues(values, user);
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').update(params, fileValues);
    emitMediaEvent(MEDIA_UPDATE, res);
    return res;
  },

  async add(values, { user } = {}) {
    const fileValues = prepareFileValues(values, user);
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').create(fileValues);
    emitMediaEvent(MEDIA_CREATE, res);
    return res;
  },

  fetch(params, populate) {
    return strapi.query('file', 'upload').findOne(params, populate);
  },

  fetchAll(params, populate) {
    applyCombinedFilters(params);
    return strapi.query('file', 'upload').find(params, populate);
  },

  search(params, populate) {
    return strapi.query('file', 'upload').search(params, populate);
  },

  countSearch(params) {
    return strapi.query('file', 'upload').countSearch(params);
  },

  count(params) {
    applyCombinedFilters(params);
    return strapi.query('file', 'upload').count(params);
  },

  async remove(file) {
    const config = strapi.plugins.upload.config;
    await executeProviderDelete(file, config);

    const media = await strapi.query('file', 'upload').findOne({ id: file.id });
    emitMediaEvent(MEDIA_DELETE, media);

    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;
    const arr = Array.isArray(files) ? files : [files];

    const enhancedFiles = await Promise.all(
      arr.map(file => {
        return this.enhanceFile(file, {}, { refId: id, ref: model, source, field });
      })
    );

    await Promise.all(enhancedFiles.map(file => this.uploadFileAndPersist(file)));
  },

  getSettings() {
    return strapi
      .store({
        type: 'plugin',
        name: 'upload',
        key: 'settings',
      })
      .get();
  },

  setSettings(value) {
    if (value.responsiveDimensions === true) {
      strapi.telemetry.send('didEnableResponsiveDimensions');
    } else {
      strapi.telemetry.send('didDisableResponsiveDimensions');
    }

    return strapi
      .store({
        type: 'plugin',
        name: 'upload',
        key: 'settings',
      })
      .set({ value });
  },
};
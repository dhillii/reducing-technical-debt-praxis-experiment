const extractMimeExclusionFilters = params => {
  // FIXME: until we support boolean operators for querying we need to make mime_ncontains use AND instead of OR
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Enriches media metadata before persisting to support telemetry insights.
 * Emits events for caption and alternativeText usage.
 */
const sendMediaMetrics = data => {
  if (_.has(data, 'caption') && !_.isEmpty(data.caption)) {
    strapi.telemetry.send('didSaveMediaWithCaption');
  }

  if (_.has(data, 'alternativeText') && !_.isEmpty(data.alternativeText)) {
    strapi.telemetry.send('didSaveMediaWithAlternativeText');
  }
};

const sanitizeForUpsert = (dbFile, fileData) => {
  _.assign(fileData, {
    hash: dbFile.hash,
    ext: dbFile.ext,
  });
};

const deletePreviousFileFormats = async (dbFile, config) => {
  if (dbFile.provider === config.provider) {
    await strapi.plugins.upload.provider.delete(dbFile);

    if (dbFile.formats) {
      await Promise.all(
        Object.keys(dbFile.formats).map(key =>
          strapi.plugins.upload.provider.delete(dbFile.formats[key])
        )
      );
    }
  }
};

const extractAndUploadFormats = async (fileData, originalFormats = {}) => {
  const { generateThumbnail, generateResponsiveFormats } =
    strapi.plugins.upload.services['image-manipulation'];

  // clear old formats
  _.set(fileData, 'formats', {});

  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }

  const formats = await generateResponsiveFormats(fileData);
  if (Array.isArray(formats) && formats.length > 0) {
    for (const format of formats) {
      if (!format) continue;

      const { key, file } = format;
      await strapi.plugins.upload.provider.upload(file);
      delete file.buffer;
      _.set(fileData, ['formats', key], file);
    }
  }
};

const applyMetadataDimensionsAndProvider = async (fileData, config) => {
  const { getDimensions } = strapi.plugins.upload.services['image-manipulation'];

  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;

  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });
};

const uploadFileAndPersistInternal = async (fileData, { user }) => {
  const config = strapi.plugins.upload.config;

  await strapi.plugins.upload.provider.upload(fileData);

  await extractAndUploadFormats(fileData);

  await applyMetadataDimensionsAndProvider(fileData, config);

  return module.exports.add(fileData, { user });
};

const updateFileAndPersistInternal = async (id, fileData, { user }) => {
  const dbFile = await module.exports.fetch({ id });
  if (!dbFile) {
    throw strapi.errors.notFound('file not found');
  }

  sanitizeForUpsert(dbFile, fileData);

  const config = strapi.plugins.upload.config;
  await deletePreviousFileFormats(dbFile, config);

  await strapi.plugins.upload.provider.upload(fileData);

  await extractAndUploadFormats(fileData);

  await applyMetadataDimensionsAndProvider(fileData, config);

  return module.exports.update({ id }, fileData, { user });
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
      entity.related = [
        {
          refId,
          ref,
          source,
          field,
        },
      ];
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

    const formattedFile = module.exports.formatFileInfo(
      {
        filename: file.name,
        type: file.type,
        size: file.size,
      },
      fileInfo,
      metas
    );

    return _.assign(formattedFile, info, {
      buffer,
    });
  },

  async upload({ data, files }, { user } = {}) {
    const { fileInfo, ...metas } = data;
    const fileArray = Array.isArray(files) ? files : [files];
    const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

    const doUpload = async (file, fileInfo) => {
      const fileData = await module.exports.enhanceFile(file, fileInfo, metas);
      return module.exports.uploadFileAndPersist(fileData, { user });
    };

    return await Promise.all(
      fileArray.map((file, idx) => doUpload(file, fileInfoArray[idx] || {}))
    );
  },

  async uploadFileAndPersist(fileData, { user } = {}) {
    return uploadFileAndPersistInternal(fileData, { user });
  },

  async updateFileInfo(id, { name, alternativeText, caption }, { user } = {}) {
    const dbFile = await module.exports.fetch({ id });
    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const newInfos = {
      name: _.isNil(name) ? dbFile.name : name,
      alternativeText: _.isNil(alternativeText) ? dbFile.alternativeText : alternativeText,
      caption: _.isNil(caption) ? dbFile.caption : caption,
    };

    return module.exports.update({ id }, newInfos, { user });
  },

  async replace(id, { data, file }, { user } = {}) {
    const { fileInfo } = data;
    const fileData = await module.exports.enhanceFile(file, fileInfo);
    return updateFileAndPersistInternal(id, fileData, { user });
  },

  async update(params, values, { user } = {}) {
    const fileValues = { ...values };
    if (user) {
      fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    }
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').update(params, fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit('MEDIA_UPDATE', {
      media: sanitizeEntity(res, { model: modelDef }),
    });
    return res;
  },

  async add(values, { user } = {}) {
    const fileValues = { ...values };
    if (user) {
      fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
      fileValues[CREATED_BY_ATTRIBUTE] = user.id;
    }
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').create(fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit('MEDIA_CREATE', {
      media: sanitizeEntity(res, { model: modelDef }),
    });
    return res;
  },

  fetch(params, populate) {
    return strapi.query('file', 'upload').findOne(params, populate);
  },

  fetchAll(params, populate) {
    extractMimeExclusionFilters(params);
    return strapi.query('file', 'upload').find(params, populate);
  },

  search(params, populate) {
    return strapi.query('file', 'upload').search(params, populate);
  },

  countSearch(params) {
    return strapi.query('file', 'upload').countSearch(params);
  },

  count(params) {
    extractMimeExclusionFilters(params);
    return strapi.query('file', 'upload').count(params);
  },

  async remove(file) {
    const config = strapi.plugins.upload.config;

    if (file.provider === config.provider) {
      await strapi.plugins.upload.provider.delete(file);

      if (file.formats) {
        await Promise.all(
          Object.keys(file.formats).map(key =>
            strapi.plugins.upload.provider.delete(file.formats[key])
          )
        );
      }
    }

    const media = await strapi.query('file', 'upload').findOne({
      id: file.id,
    });

    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit('MEDIA_DELETE', {
      media: sanitizeEntity(media, { model: modelDef }),
    });

    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;

    const arr = Array.isArray(files) ? files : [files];
    const enhancedFiles = await Promise.all(
      arr.map(file =>
        module.exports.enhanceFile(file, {}, { refId: id, ref: model, source, field })
      )
    );

    await Promise.all(enhancedFiles.map(file => module.exports.uploadFileAndPersist(file)));
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
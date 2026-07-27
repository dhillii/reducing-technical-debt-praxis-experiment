const combineFilters = params => {
  const filterMapper = {
    mime_ncontains: val => ({ mime_ncontains: val }),
  };

  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => filterMapper.mime_ncontains(val));
    delete params.mime_ncontains;
  }
};

const isFileTooLarge = (file, maxSize) => {
  return file.size > maxSize;
};

const getErrorForFileTooLarge = file => {
  return strapi.errors.entityTooLarge('FileTooBig', {
    errors: [
      {
        id: 'Upload.status.sizeLimit',
        message: `${file.name} file is bigger than the limit size!`,
        values: { file: file.name },
      },
    ],
  });
};

const getDimensionsAndDeleteBuffer = async fileData => {
  const { width, height } = await strapi.plugins.upload.services['image-manipulation'].getDimensions(fileData.buffer);
  delete fileData.buffer;
  return { width, height };
};

const uploadFileAndGenerateFormats = async (fileData, config) => {
  await strapi.plugins.upload.provider.upload(fileData);

  const thumbnailFile = await strapi.plugins.upload.services['image-manipulation'].generateThumbnail(fileData);
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }

  const formats = await strapi.plugins.upload.services['image-manipulation'].generateResponsiveFormats(fileData);
  if (Array.isArray(formats) && formats.length > 0) {
    for (const format of formats) {
      if (!format) continue;

      const { key, file } = format;

      await strapi.plugins.upload.provider.upload(file);
      delete file.buffer;

      _.set(fileData, ['formats', key], file);
    }
  }

  return fileData;
};

const updateFileInfoAndEmitEvent = async (id, values, user) => {
  const fileValues = { ...values };
  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
  }
  sendMediaMetrics(fileValues);

  const res = await strapi.query('file', 'upload').update({ id }, fileValues);
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_UPDATE, { media: sanitizeEntity(res, { model: modelDef }) });
  return res;
};

const addFileInfoAndEmitEvent = async (values, user) => {
  const fileValues = { ...values };
  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    fileValues[CREATED_BY_ATTRIBUTE] = user.id;
  }
  sendMediaMetrics(fileValues);

  const res = await strapi.query('file', 'upload').create(fileValues);
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_CREATE, { media: sanitizeEntity(res, { model: modelDef }) });
  return res;
};

const removeFileAndEmitEvent = async file => {
  const config = strapi.plugins.upload.config;

  // execute delete function of the provider
  if (file.provider === config.provider) {
    await strapi.plugins.upload.provider.delete(file);

    if (file.formats) {
      await Promise.all(
        Object.keys(file.formats).map(key => {
          return strapi.plugins.upload.provider.delete(file.formats[key]);
        })
      );
    }
  }

  const media = await strapi.query('file', 'upload').findOne({
    id: file.id,
  });

  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_DELETE, { media: sanitizeEntity(media, { model: modelDef }) });

  return strapi.query('file', 'upload').delete({ id: file.id });
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
        throw getErrorForFileTooLarge(file);
      }
      throw e;
    }

    const { optimize } = strapi.plugins.upload.services['image-manipulation'];

    const { buffer, info } = await optimize(readBuffer);

    const formattedFile = this.formatFileInfo(
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
      const fileData = await this.enhanceFile(file, fileInfo, metas);

      return this.uploadFileAndPersist(fileData, { user });
    };

    return await Promise.all(
      fileArray.map((file, idx) => doUpload(file, fileInfoArray[idx] || {}))
    );
  },

  async uploadFileAndPersist(fileData, { user } = {}) {
    const config = strapi.plugins.upload.config;

    const fileDataWithDimensions = await getDimensionsAndDeleteBuffer(fileData);

    const fileDataWithFormats = await uploadFileAndGenerateFormats(fileDataWithDimensions, config);

    _.assign(fileDataWithFormats, {
      provider: config.provider,
    });

    return addFileInfoAndEmitEvent(fileDataWithFormats, user);
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

    return updateFileInfoAndEmitEvent(id, newInfos, user);
  },

  async replace(id, { data, file }, { user } = {}) {
    const config = strapi.plugins.upload.config;

    const dbFile = await this.fetch({ id });

    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const { fileInfo } = data;
    const fileData = await this.enhanceFile(file, fileInfo);

    // keep a constant hash
    _.assign(fileData, {
      hash: dbFile.hash,
      ext: dbFile.ext,
    });

    // execute delete function of the provider
    await removeFileAndEmitEvent(dbFile);

    const fileDataWithDimensions = await getDimensionsAndDeleteBuffer(fileData);

    const fileDataWithFormats = await uploadFileAndGenerateFormats(fileDataWithDimensions, config);

    _.assign(fileDataWithFormats, {
      provider: config.provider,
    });

    return updateFileInfoAndEmitEvent(id, fileDataWithFormats, user);
  },

  async update(params, values, { user } = {}) {
    return updateFileInfoAndEmitEvent(params.id, values, user);
  },

  async add(values, { user } = {}) {
    return addFileInfoAndEmitEvent(values, user);
  },

  fetch(params, populate) {
    return strapi.query('file', 'upload').findOne(params, populate);
  },

  fetchAll(params, populate) {
    combineFilters(params);
    return strapi.query('file', 'upload').find(params, populate);
  },

  search(params, populate) {
    return strapi.query('file', 'upload').search(params, populate);
  },

  countSearch(params) {
    return strapi.query('file', 'upload').countSearch(params);
  },

  count(params) {
    combineFilters(params);
    return strapi.query('file', 'upload').count(params);
  },

  async remove(file) {
    return removeFileAndEmitEvent(file);
  },

  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;

    const arr = Array.isArray(files) ? files : [files];
    const enhancedFiles = await Promise.all(
      arr.map(file => {
        return this.enhanceFile(
          file,
          {},
          {
            refId: id,
            ref: model,
            source,
            field,
          }
        );
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
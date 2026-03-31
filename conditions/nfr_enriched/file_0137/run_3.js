```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const _ = require('lodash');
const {
  nameToSlug,
  contentTypes: contentTypesUtils,
  sanitizeEntity,
  webhook: webhookUtils,
} = require('strapi-utils');

const { MEDIA_UPDATE, MEDIA_CREATE, MEDIA_DELETE } = webhookUtils.webhookEvents;
const { bytesToKbytes } = require('../utils/file');
const { UPDATED_BY_ATTRIBUTE, CREATED_BY_ATTRIBUTE } = contentTypesUtils.constants;

// ============================================================================
// Utility Functions
// ============================================================================

const randomSuffix = () => crypto.randomBytes(5).toString('hex');

const generateFileName = name => {
  const baseName = nameToSlug(name, { separator: '_', lowercase: false });
  return `${baseName}_${randomSuffix()}`;
};

const sendMediaMetrics = data => {
  if (_.has(data, 'caption') && !_.isEmpty(data.caption)) {
    strapi.telemetry.send('didSaveMediaWithCaption');
  }
  if (_.has(data, 'alternativeText') && !_.isEmpty(data.alternativeText)) {
    strapi.telemetry.send('didSaveMediaWithAlternativeText');
  }
};

const combineFilters = params => {
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

const getImageManipulationService = () => strapi.plugins.upload.services['image-manipulation'];

const getUploadProvider = () => strapi.plugins.upload.provider;

const getUploadConfig = () => strapi.plugins.upload.config;

const getFileQuery = () => strapi.query('file', 'upload');

const getFileModel = () => strapi.getModel('file', 'upload');

const emitMediaEvent = (eventType, media) => {
  strapi.eventHub.emit(eventType, { media: sanitizeEntity(media, { model: getFileModel() }) });
};

// ============================================================================
// File Reading & Enhancement
// ============================================================================

const readFileBuffer = async filePath => {
  try {
    return await util.promisify(fs.readFile)(filePath);
  } catch (e) {
    if (e.code === 'ERR_FS_FILE_TOO_LARGE') {
      throw strapi.errors.entityTooLarge('FileTooBig', {
        errors: [
          {
            id: 'Upload.status.sizeLimit',
            message: `${path.basename(filePath)} file is bigger than the limit size!`,
            values: { file: path.basename(filePath) },
          },
        ],
      });
    }
    throw e;
  }
};

const buildFileEntity = (filename, type, size, fileInfo = {}, metas = {}) => {
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

  const { refId, ref, source, field, path: metaPath } = metas;

  if (refId && ref && field) {
    entity.related = [{ refId, ref, source, field }];
  }

  if (metaPath) {
    entity.path = metaPath;
  }

  return entity;
};

// ============================================================================
// Format & Thumbnail Processing
// ============================================================================

const processThumbnail = async (fileData, provider) => {
  const { generateThumbnail } = getImageManipulationService();
  const thumbnailFile = await generateThumbnail(fileData);

  if (thumbnailFile) {
    await provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }
};

const processResponsiveFormats = async (fileData, provider) => {
  const { generateResponsiveFormats } = getImageManipulationService();
  const formats = await generateResponsiveFormats(fileData);

  if (Array.isArray(formats) && formats.length > 0) {
    for (const format of formats) {
      if (!format) continue;

      const { key, file } = format;
      await provider.upload(file);
      delete file.buffer;
      _.set(fileData, ['formats', key], file);
    }
  }
};

const finalizeFileData = async fileData => {
  const { getDimensions } = getImageManipulationService();
  const { width, height } = await getDimensions(fileData.buffer);

  delete fileData.buffer;

  const config = getUploadConfig();
  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });
};

// ============================================================================
// Provider Operations
// ============================================================================

const deleteFileFromProvider = async (file, provider, config) => {
  if (file.provider === config.provider) {
    await provider.delete(file);

    if (file.formats) {
      await Promise.all(
        Object.keys(file.formats).map(key => provider.delete(file.formats[key]))
      );
    }
  }
};

// ============================================================================
// Database Operations
// ============================================================================

const persistFileData = async (fileData, user = null) => {
  const fileValues = { ...fileData };

  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    fileValues[CREATED_BY_ATTRIBUTE] = user.id;
  }

  sendMediaMetrics(fileValues);

  const res = await getFileQuery().create(fileValues);
  emitMediaEvent(MEDIA_CREATE, res);

  return res;
};

const updateFileData = async (params, values, user = null) => {
  const fileValues = { ...values };

  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
  }

  sendMediaMetrics(fileValues);

  const res = await getFileQuery().update(params, fileValues);
  emitMediaEvent(MEDIA_UPDATE, res);

  return res;
};

// ============================================================================
// Main Service Module
// ============================================================================

module.exports = {
  formatFileInfo(fileInfo, additionalInfo = {}, metas = {}) {
    const { filename, type, size } = fileInfo;
    return buildFileEntity(filename, type, size, additionalInfo, metas);
  },

  async enhanceFile(file, fileInfo = {}, metas = {}) {
    const readBuffer = await readFileBuffer(file.path);
    const { optimize } = getImageManipulationService();
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

    return _.assign(formattedFile, info, { buffer });
  },

  async upload({ data, files }, { user } = {}) {
    const { fileInfo, ...metas } = data;
    const fileArray = Array.isArray(files) ? files : [files];
    const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

    return Promise.all(
      fileArray.map((file, idx) =>
        this.enhanceFile(file, fileInfoArray[idx] || {}, metas).then(fileData =>
          this.uploadFileAndPersist(fileData, { user })
        )
      )
    );
  },

  async uploadFileAndPersist(fileData, { user } = {}) {
    const provider = getUploadProvider();

    await provider.upload(fileData);
    await processThumbnail(fileData, provider);
    await processResponsiveFormats(fileData, provider);
    await finalizeFileData(fileData);

    return persistFileData(fileData, user);
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

    return updateFileData({ id }, newInfos, user);
  },

  async replace(id, { data, file }, { user } = {}) {
    const config = getUploadConfig();
    const provider = getUploadProvider();
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

    await deleteFileFromProvider(dbFile, provider, config);
    await provider.upload(fileData);

    _.set(fileData, 'formats', {});

    await processThumbnail(fileData, provider);
    await processResponsiveFormats(fileData, provider);
    await finalizeFileData(fileData);

    return updateFileData({ id }, fileData, user);
  },

  async update(params, values, { user } = {}) {
    return updateFileData(params, values, user);
  },

  async add(values, { user } = {}) {
    return persistFileData(values, user);
  },

  fetch(params, populate) {
    return getFileQuery().findOne(params, populate);
  },

  fetchAll(params, populate) {
    combineFilters(params);
    return getFileQuery().find(params, populate);
  },

  search(params, populate) {
    return getFileQuery().search(params, populate);
  },

  countSearch(params) {
    return getFileQuery().countSearch(params);
  },

  count(params) {
    combineFilters(params);
    return getFileQuery().count(params);
  },

  async remove(file) {
    const config = getUploadConfig();
    const provider = getUploadProvider();

    await deleteFileFromProvider(file, provider, config);

    const media = await getFileQuery().findOne({ id: file.id });
    emitMediaEvent(MEDIA_DELETE, media);

    return getFileQuery().delete({ id: file.id });
  },

  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;
    const arr = Array.isArray(files) ? files : [files];

    const enhancedFiles = await Promise.all(
      arr.map(file =>
        this.enhanceFile(file, {}, {
          refId: id,
          ref: model,
          source,
          field,
        })
      )
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
```
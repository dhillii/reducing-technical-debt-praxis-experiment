'use strict';

/**
 * Upload.js service
 *
 * @description: A set of functions similar to controller's actions to avoid code duplication.
 */

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

const randomSuffix = () => crypto.randomBytes(5).toString('hex');

/**
 * Generate a unique file name based on the base name and a random suffix.
 * @param {string} name - The original file name.
 * @returns {string} The generated file name.
 */
const generateFileName = name => {
  const baseName = nameToSlug(name, { separator: '_', lowercase: false });
  return `${baseName}_${randomSuffix()}`;
};

/**
 * Send telemetry events based on media metadata presence.
 * @param {Object} data - The media entity data.
 */
const sendMediaMetrics = data => {
  if (_.has(data, 'caption') && !_.isEmpty(data.caption)) {
    strapi.telemetry.send('didSaveMediaWithCaption');
  }

  if (_.has(data, 'alternativeText') && !_.isEmpty(data.alternativeText)) {
    strapi.telemetry.send('didSaveMediaWithAlternativeText');
  }
};

/**
 * Normalize query parameters for MIME filtering.
 * Converts mime_ncontains array into _where array constraints.
 * @param {Object} params - The query parameters.
 */
const normalizeMimeNcontainsFilter = params => {
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Format file information into a standardized entity structure.
 * @param {Object} fileInfo - Basic file info (filename, type, size).
 * @param {Object} extendedInfo - Additional metadata (alternative text, caption).
 * @param {Object} metas - Reference metadata (refId, ref, source, field, path).
 * @returns {Object} The formatted file entity.
 */
const formatFileInfo = ({ filename, type, size }, fileInfo = {}, metas = {}) => {
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

  if (metas.refId && metas.ref && metas.field) {
    entity.related = [{
      refId: metas.refId,
      ref: metas.ref,
      source: metas.source,
      field: metas.field,
    }];
  }

  if (metas.path) {
    entity.path = metas.path;
  }

  return entity;
};

/**
 * Enhance an uploaded file with processing steps and metadata.
 * @param {Object} file - The uploaded file object.
 * @param {Object} fileInfo - Additional file metadata.
 * @param {Object} metas - Reference metadata.
 * @returns {Object} Processed file data with buffer and metadata.
 */
const enhanceFile = async (file, fileInfo = {}, metas = {}) => {
  let readBuffer;
  try {
    readBuffer = await util.promisify(fs.readFile)(file.path);
  } catch (e) {
    if (e.code === 'ERR_FS_FILE_TOO_LARGE') {
      throw strapi.errors.entityTooLarge('FileTooBig', {
        errors: [{
          id: 'Upload.status.sizeLimit',
          message: `${file.name} file is bigger than the limit size!`,
          values: { file: file.name },
        }],
      });
    }
    throw e;
  }

  const { optimize } = strapi.plugins.upload.services['image-manipulation'];
  const { buffer, info } = await optimize(readBuffer);

  const formattedFile = formatFileInfo(
    { filename: file.name, type: file.type, size: file.size },
    fileInfo,
    metas
  );

  return _.assign(formattedFile, info, { buffer });
};

/**
 * Upload and persist a single file with image processing.
 * @param {Object} fileData - Processed file data.
 * @param {Object} context - User context.
 * @returns {Object} Persisted file entity.
 */
const persistUploadedFile = async (fileData, { user } = {}) => {
  const config = strapi.plugins.upload.config;
  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

  await strapi.plugins.upload.provider.upload(fileData);

  // Generate and persist thumbnail
  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }

  // Generate and persist responsive formats
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

  // Extract and assign dimension metadata
  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;

  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });

  return strapi.plugins.upload.services.upload.add(fileData, { user });
};

/**
 * Upload a file and update the record in the database.
 * @param {Object} id - The identifier of the file to replace.
 * @param {Object} data - Request data containing new file info.
 * @param {Object} file - New file object.
 * @param {Object} user - User performing the action.
 * @returns {Object} Updated file entity.
 */
const replaceFileRecord = async (id, { data, file }, { user } = {}) => {
  const config = strapi.plugins.upload.config;
  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

  const dbFile = await strapi.plugins.upload.services.upload.fetch({ id });

  if (!dbFile) {
    throw strapi.errors.notFound('file not found');
  }

  const { fileInfo } = data;
  const fileData = await enhanceFile(file, fileInfo);

  // Preserve original hash and extension
  _.assign(fileData, {
    hash: dbFile.hash,
    ext: dbFile.ext,
  });

  // Delete old files from provider storage
  if (dbFile.provider === config.provider) {
    await strapi.plugins.upload.provider.delete(dbFile);
    if (dbFile.formats) {
      await Promise.all(Object.keys(dbFile.formats).map(key =>
        strapi.plugins.upload.provider.delete(dbFile.formats[key])
      ));
    }
  }

  // Upload new file and process formats
  await strapi.plugins.upload.provider.upload(fileData);
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

  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;

  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });

  return strapi.plugins.upload.services.upload.update({ id }, fileData, { user });
};

/**
 * Update file record information (metadata only).
 * @param {number|string} id - File ID.
 * @param {Object} info - New metadata values.
 * @param {Object} user - User performing the update.
 * @returns {Object} Updated file entity.
 */
const updateFileInfoRecord = async (id, { name, alternativeText, caption }, { user } = {}) => {
  const dbFile = await strapi.plugins.upload.services.upload.fetch({ id });

  if (!dbFile) {
    throw strapi.errors.notFound('file not found');
  }

  const newInfos = {
    name: _.isNil(name) ? dbFile.name : name,
    alternativeText: _.isNil(alternativeText) ? dbFile.alternativeText : alternativeText,
    caption: _.isNil(caption) ? dbFile.caption : caption,
  };

  return strapi.plugins.upload.services.upload.update({ id }, newInfos, { user });
};

/**
 * Update file entity with telemetry tracking.
 * @param {Object} params - Query parameters for entity lookup.
 * @param {Object} values - Field values to update.
 * @param {Object} context - User context.
 * @returns {Object} Updated file entity.
 */
const updateFileEntity = async (params, values, { user } = {}) => {
  const fileValues = { ...values };
  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
  }
  sendMediaMetrics(fileValues);

  const res = await strapi.query('file', 'upload').update(params, fileValues);
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_UPDATE, { media: sanitizeEntity(res, { model: modelDef }) });
  return res;
};

/**
 * Create a new file entity with telemetry tracking.
 * @param {Object} values - File field values.
 * @param {Object} context - User context.
 * @returns {Object} Created file entity.
 */
const addFileEntity = async (values, { user } = {}) => {
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

/**
 * Remove a file entity and clean up provider storage.
 * @param {Object} file - File entity to delete.
 * @returns {Promise} Resolves after successful deletion.
 */
const removeFileEntity = async (file) => {
  const config = strapi.plugins.upload.config;

  if (file.provider === config.provider) {
    await strapi.plugins.upload.provider.delete(file);
    if (file.formats) {
      await Promise.all(Object.keys(file.formats).map(key =>
        strapi.plugins.upload.provider.delete(file.formats[key])
      ));
    }
  }

  const media = await strapi.query('file', 'upload').findOne({ id: file.id });
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_DELETE, { media: sanitizeEntity(media, { model: modelDef }) });

  return strapi.query('file', 'upload').delete({ id: file.id });
};

module.exports = {
  /**
   * @deprecated Use formatFileInfo() directly
   * @param {...any} args
   */
  formatFileInfo,

  /**
   * @deprecated Use enhanceFile() directly
   * @param {...any} args
   */
  enhanceFile,

  /**
   * @deprecated Use uploadFileAndPersist() directly
   * @param {...any} args
   */
  async uploadFileAndPersist(fileData, context) {
    return persistUploadedFile(fileData, context);
  },

  /**
   * @deprecated Use replaceFileRecord() directly
   * @param {...any} args
   */
  async replace(id, payload, context) {
    return replaceFileRecord(id, payload, context);
  },

  /**
   * @deprecated Use updateFileEntity() directly
   * @param {...any} args
   */
  async update(params, values, context) {
    return updateFileEntity(params, values, context);
  },

  /**
   * @deprecated Use addFileEntity() directly
   * @param {...any} args
   */
  async add(values, context) {
    return addFileEntity(values, context);
  },

  /**
   * @deprecated Use fetch() directly
   * @param {...any} args
   */
  fetch(params, populate) {
    return strapi.query('file', 'upload').findOne(params, populate);
  },

  /**
   * @deprecated Use fetchAll() directly
   * @param {...any} args
   */
  fetchAll(params, populate) {
    normalizeMimeNcontainsFilter(params);
    return strapi.query('file', 'upload').find(params, populate);
  },

  /**
   * @deprecated Use search() directly
   * @param {...any} args
   */
  search(params, populate) {
    return strapi.query('file', 'upload').search(params, populate);
  },

  /**
   * @deprecated Use countSearch() directly
   * @param {...any} args
   */
  countSearch(params) {
    return strapi.query('file', 'upload').countSearch(params);
  },

  /**
   * @deprecated Use count() directly
   * @param {...any} args
   */
  count(params) {
    normalizeMimeNcontainsFilter(params);
    return strapi.query('file', 'upload').count(params);
  },

  /**
   * @deprecated Use removeFileEntity() directly
   * @param {...any} args
   */
  async remove(file) {
    return removeFileEntity(file);
  },

  /**
   * @deprecated Use enhancedFiles.map(file => this.uploadFileAndPersist(file))
   * @param {...any} args
   */
  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;
    const arr = Array.isArray(files) ? files : [files];
    const enhancedFiles = await Promise.all(arr.map(file =>
      enhanceFile(file, {}, { refId: id, ref: model, source, field })
    ));
    await Promise.all(enhancedFiles.map(file =>
      strapi.plugins.upload.services.upload.uploadFileAndPersist(file)
    ));
  },

  /**
   * @deprecated Use getSettings directly
   * @param {...any} args
   */
  getSettings() {
    return strapi
      .store({ type: 'plugin', name: 'upload', key: 'settings' })
      .get();
  },

  /**
   * @deprecated Use setSettings directly
   * @param {...any} args
   */
  setSettings(value) {
    if (value.responsiveDimensions === true) {
      strapi.telemetry.send('didEnableResponsiveDimensions');
    } else {
      strapi.telemetry.send('didDisableResponsiveDimensions');
    }
    return strapi
      .store({ type: 'plugin', name: 'upload', key: 'settings' })
      .set({ value });
  },
};
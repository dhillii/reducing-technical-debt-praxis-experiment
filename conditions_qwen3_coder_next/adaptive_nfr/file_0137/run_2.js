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

/**
 * Combines filter parameters for mime_ncontains by converting to _where array
 * @param {Object} params - Query parameters object
 */
const combineFilters = params => {
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Creates file entity object from file info and metadata
 * @param {Object} fileInfo - File information object
 * @param {Object} extraInfo - Additional file info
 * @param {Object} metas - Metadata object
 * @returns {Object} Formatted file entity
 */
const formatFileInfo = ({ filename, type, size }, extraInfo = {}, metas = {}) => {
  const ext = path.extname(filename);
  const basename = path.basename(extraInfo.name || filename, ext);
  const usedName = extraInfo.name || filename;

  const entity = {
    name: usedName,
    alternativeText: extraInfo.alternativeText,
    caption: extraInfo.caption,
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
 * Enhances file with image manipulation and metadata
 * @param {Object} file - File object
 * @param {Object} fileInfo - File info object
 * @param {Object} metas - Metadata object
 * @returns {Promise<Object>} Enhanced file data
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
 * Uploads file and persists to database
 * @param {Object} fileData - File data object
 * @param {Object} context - Context object with user info
 * @returns {Promise<Object>} Persisted file entity
 */
const uploadFileAndPersist = async (fileData, { user } = {}) => {
  const config = strapi.plugins.upload.config;
  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

  await strapi.plugins.upload.provider.upload(fileData);

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

  return this.add(fileData, { user });
};

/**
 * Updates file info with new metadata
 * @param {String} id - File ID
 * @param {Object} info - New info object
 * @param {Object} context - Context object with user info
 * @returns {Promise<Object>} Updated file entity
 */
const updateFileInfo = async (id, { name, alternativeText, caption }, { user } = {}) => {
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
};

/**
 * Replaces existing file with new file data
 * @param {String} id - File ID
 * @param {Object} data - Data object containing fileInfo and file
 * @param {Object} context - Context object with user info
 * @returns {Promise<Object>} Updated file entity
 */
const replace = async (id, { data, file }, { user } = {}) => {
  const config = strapi.plugins.upload.config;
  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

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
    await strapi.plugins.upload.provider.delete(dbFile);

    if (dbFile.formats) {
      await Promise.all(
        Object.keys(dbFile.formats).map(key => strapi.plugins.upload.provider.delete(dbFile.formats[key]))
      );
    }
  }

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

  return this.update({ id }, fileData, { user });
};

/**
 * Updates file entity with new values
 * @param {Object} params - Query parameters
 * @param {Object} values - New values
 * @param {Object} context - Context object with user info
 * @returns {Promise<Object>} Updated file entity
 */
const update = async (params, values, { user } = {}) => {
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
 * Creates new file entity
 * @param {Object} values - File values
 * @param {Object} context - Context object with user info
 * @returns {Promise<Object>} Created file entity
 */
const add = async (values, { user } = {}) => {
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
 * Fetches single file entity
 * @param {Object} params - Query parameters
 * @param {String} populate - Populate options
 * @returns {Promise<Object>} File entity
 */
const fetch = (params, populate) => {
  return strapi.query('file', 'upload').findOne(params, populate);
};

/**
 * Fetches all file entities
 * @param {Object} params - Query parameters
 * @param {String} populate - Populate options
 * @returns {Promise<Array>} Array of file entities
 */
const fetchAll = (params, populate) => {
  combineFilters(params);
  return strapi.query('file', 'upload').find(params, populate);
};

/**
 * Searches files
 * @param {Object} params - Query parameters
 * @param {String} populate - Populate options
 * @returns {Promise<Array>} Search results
 */
const search = (params, populate) => {
  return strapi.query('file', 'upload').search(params, populate);
};

/**
 * Counts search results
 * @param {Object} params - Query parameters
 * @returns {Promise<Number>} Count of search results
 */
const countSearch = (params) => {
  return strapi.query('file', 'upload').countSearch(params);
};

/**
 * Counts file entities
 * @param {Object} params - Query parameters
 * @returns {Promise<Number>} Count of file entities
 */
const count = (params) => {
  combineFilters(params);
  return strapi.query('file', 'upload').count(params);
};

/**
 * Removes file entity
 * @param {Object} file - File object to remove
 * @returns {Promise<Object>} Removed file entity
 */
const remove = async (file) => {
  const config = strapi.plugins.upload.config;

  if (file.provider === config.provider) {
    await strapi.plugins.upload.provider.delete(file);

    if (file.formats) {
      await Promise.all(
        Object.keys(file.formats).map(key => strapi.plugins.upload.provider.delete(file.formats[key]))
      );
    }
  }

  const media = await strapi.query('file', 'upload').findOne({ id: file.id });
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_DELETE, { media: sanitizeEntity(media, { model: modelDef }) });

  return strapi.query('file', 'upload').delete({ id: file.id });
};

/**
 * Uploads files to entity
 * @param {Object} params - Upload parameters
 * @param {Array|Object} files - Files to upload
 * @param {String} source - Source identifier
 * @returns {Promise<Array>} Array of uploaded file entities
 */
const uploadToEntity = async (params, files, source) => {
  const { id, model, field } = params;
  const arr = Array.isArray(files) ? files : [files];

  const enhancedFiles = await Promise.all(
    arr.map(file => enhanceFile(
      file,
      {},
      {
        refId: id,
        ref: model,
        source,
        field,
      }
    ))
  );

  return await Promise.all(enhancedFiles.map(file => uploadFileAndPersist(file)));
};

/**
 * Gets upload settings
 * @returns {Promise<Object>} Upload settings
 */
const getSettings = () => {
  return strapi
    .store({
      type: 'plugin',
      name: 'upload',
      key: 'settings',
    })
    .get();
};

/**
 * Sets upload settings
 * @param {Object} value - New settings value
 * @returns {Promise<Object>} Updated settings
 */
const setSettings = (value) => {
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
};

module.exports = {
  formatFileInfo,
  enhanceFile,
  upload: async ({ data, files }, { user } = {}) => {
    const { fileInfo, ...metas } = data;
    const fileArray = Array.isArray(files) ? files : [files];
    const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

    const doUpload = async (file, fileInfo) => {
      const fileData = await enhanceFile(file, fileInfo, metas);
      return uploadFileAndPersist(fileData, { user });
    };

    return await Promise.all(
      fileArray.map((file, idx) => doUpload(file, fileInfoArray[idx] || {}))
    );
  },
  uploadFileAndPersist,
  updateFileInfo,
  replace,
  update,
  add,
  fetch,
  fetchAll,
  search,
  countSearch,
  count,
  remove,
  uploadToEntity,
  getSettings,
  setSettings,
};
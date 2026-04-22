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

/**
 * Send telemetry events based on media properties.
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
 * Adjust query filters for legacy mime_ncontains handling.
 */
const combineFilters = params => {
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Read a file from disk and handle size limit errors.
 */
const readFileBuffer = async filePath => {
  try {
    return await util.promisify(fs.readFile)(filePath);
  } catch (e) {
    if (e.code === 'ERR_FS_FILE_TOO_LARGE') {
      throw strapi.errors.entityTooLarge('FileTooBig', {
        errors: [
          {
            id: 'Upload.status.sizeLimit',
            message: `${filePath} file is bigger than the limit size!`,
            values: { file: filePath },
          },
        ],
      });
    }
    throw e;
  }
};

/**
 * Retrieve image manipulation utilities from the upload plugin.
 */
const getImageManipulationServices = () => {
  return strapi.plugins.upload.services['image-manipulation'];
};

/**
 * Upload a file using the configured provider.
 */
const uploadProviderFile = async file => {
  await strapi.plugins.upload.provider.upload(file);
};

/**
 * Delete a file and its formats from the provider if they belong to the current provider.
 */
const deleteProviderFileAndFormats = async (file, config) => {
  if (file.provider !== config.provider) return;

  await strapi.plugins.upload.provider.delete(file);
  if (file.formats) {
    await Promise.all(
      Object.values(file.formats).map(format => strapi.plugins.upload.provider.delete(format))
    );
  }
};

/**
 * Process responsive formats: upload each and attach to the main file data.
 */
const processResponsiveFormats = async (fileData, generateResponsiveFormats) => {
  const formats = await generateResponsiveFormats(fileData);
  if (!Array.isArray(formats) || formats.length === 0) return;

  for (const fmt of formats) {
    if (!fmt) continue;
    const { key, file } = fmt;
    await uploadProviderFile(file);
    delete file.buffer;
    _.set(fileData, ['formats', key], file);
  }
};

/**
 * Generate a thumbnail, upload it, and attach to the main file data.
 */
const generateAndUploadThumbnail = async (fileData, generateThumbnail) => {
  const thumbnail = await generateThumbnail(fileData);
  if (!thumbnail) return;
  await uploadProviderFile(thumbnail);
  delete thumbnail.buffer;
  _.set(fileData, 'formats.thumbnail', thumbnail);
};

/**
 * Assign dimensions and provider information to the file data.
 */
const assignDimensionsAndProvider = async (fileData, getDimensions, config) => {
  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;
  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });
};

module.exports = {
  /**
   * Build a file entity description.
   */
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

  /**
   * Enhance a raw file with optimization and metadata.
   */
  async enhanceFile(file, fileInfo = {}, metas = {}) {
    const buffer = await readFileBuffer(file.path);
    const { optimize } = getImageManipulationServices();
    const { buffer: optimizedBuffer, info } = await optimize(buffer);

    const formatted = this.formatFileInfo(
      { filename: file.name, type: file.type, size: file.size },
      fileInfo,
      metas
    );

    return _.assign(formatted, info, { buffer: optimizedBuffer });
  },

  /**
   * Upload one or many files.
   */
  async upload({ data, files }, { user } = {}) {
    const { fileInfo, ...metas } = data;
    const fileArray = Array.isArray(files) ? files : [files];
    const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

    const uploadSingle = async (file, info) => {
      const enhanced = await this.enhanceFile(file, info, metas);
      return this.uploadFileAndPersist(enhanced, { user });
    };

    return Promise.all(fileArray.map((f, i) => uploadSingle(f, fileInfoArray[i] || {})));
  },

  /**
   * Persist a file after processing thumbnails and responsive formats.
   */
  async uploadFileAndPersist(fileData, { user } = {}) {
    const config = strapi.plugins.upload.config;
    const {
      getDimensions,
      generateThumbnail,
      generateResponsiveFormats,
    } = getImageManipulationServices();

    await uploadProviderFile(fileData);
    await generateAndUploadThumbnail(fileData, generateThumbnail);
    await processResponsiveFormats(fileData, generateResponsiveFormats);
    await assignDimensionsAndProvider(fileData, getDimensions, config);

    return this.add(fileData, { user });
  },

  /**
   * Update basic file information.
   */
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

  /**
   * Replace an existing file with a new one.
   */
  async replace(id, { data, file }, { user } = {}) {
    const config = strapi.plugins.upload.config;
    const {
      getDimensions,
      generateThumbnail,
      generateResponsiveFormats,
    } = getImageManipulationServices();

    const dbFile = await this.fetch({ id });
    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const fileData = await this.enhanceFile(file, data.fileInfo);
    _.assign(fileData, { hash: dbFile.hash, ext: dbFile.ext });

    await deleteProviderFileAndFormats(dbFile, config);
    await uploadProviderFile(fileData);
    _.set(fileData, 'formats', {});

    await generateAndUploadThumbnail(fileData, generateThumbnail);
    await processResponsiveFormats(fileData, generateResponsiveFormats);
    await assignDimensionsAndProvider(fileData, getDimensions, config);

    return this.update({ id }, fileData, { user });
  },

  /**
   * Generic update operation with telemetry.
   */
  async update(params, values, { user } = {}) {
    const fileValues = { ...values };
    if (user) fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').update(params, fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_UPDATE, {
      media: sanitizeEntity(res, { model: modelDef }),
    });
    return res;
  },

  /**
   * Generic create operation with telemetry.
   */
  async add(values, { user } = {}) {
    const fileValues = { ...values };
    if (user) {
      fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
      fileValues[CREATED_BY_ATTRIBUTE] = user.id;
    }
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').create(fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_CREATE, {
      media: sanitizeEntity(res, { model: modelDef }),
    });
    return res;
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

  /**
   * Remove a file and emit deletion event.
   */
  async remove(file) {
    const config = strapi.plugins.upload.config;
    await deleteProviderFileAndFormats(file, config);

    const media = await strapi.query('file', 'upload').findOne({ id: file.id });
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_DELETE, {
      media: sanitizeEntity(media, { model: modelDef }),
    });

    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  /**
   * Upload files and associate them with a specific entity.
   */
  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;
    const fileArray = Array.isArray(files) ? files : [files];

    const enhanced = await Promise.all(
      fileArray.map(file =>
        this.enhanceFile(file, {}, { refId: id, ref: model, source, field })
      )
    );

    await Promise.all(enhanced.map(f => this.uploadFileAndPersist(f)));
  },

  getSettings() {
    return strapi
      .store({ type: 'plugin', name: 'upload', key: 'settings' })
      .get();
  },

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
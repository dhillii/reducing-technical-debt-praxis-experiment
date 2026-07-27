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
 * Sends telemetry events based on media properties.
 * @param {Object} data - Media data.
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
 * Checks whether params contain a mime_ncontains array.
 * @param {Object} params - Query parameters.
 * @returns {boolean}
 */
const hasMimeNcontains = params =>
  _.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains);

/**
 * Transforms mime_ncontains into an AND filter.
 * @param {Object} params - Query parameters.
 */
const combineFilters = params => {
  if (hasMimeNcontains(params)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Deletes a file and its formats using the configured provider.
 * @param {Object} file - File entity.
 * @param {Object} config - Upload plugin config.
 */
const deleteProviderResources = async (file, config) => {
  const provider = strapi.plugins.upload.provider;
  if (file.provider === config.provider) {
    await provider.delete(file);
    if (file.formats) {
      await Promise.all(
        Object.keys(file.formats).map(key => provider.delete(file.formats[key]))
      );
    }
  }
};

/**
 * Handles thumbnail generation and upload.
 * @param {Object} fileData - File data.
 * @param {Function} generateThumbnail - Thumbnail generator.
 */
const handleThumbnail = async (fileData, generateThumbnail) => {
  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    const provider = strapi.plugins.upload.provider;
    await provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }
};

/**
 * Handles responsive format generation and upload.
 * @param {Object} fileData - File data.
 * @param {Function} generateResponsiveFormats - Formats generator.
 */
const handleResponsiveFormats = async (fileData, generateResponsiveFormats) => {
  const formats = await generateResponsiveFormats(fileData);
  if (Array.isArray(formats) && formats.length > 0) {
    const provider = strapi.plugins.upload.provider;
    for (const format of formats) {
      if (!format) continue;
      const { key, file } = format;
      await provider.upload(file);
      delete file.buffer;
      _.set(fileData, ['formats', key], file);
    }
  }
};

/**
 * Processes thumbnails and responsive formats for a file.
 * @param {Object} fileData - File data.
 * @param {Object} services - Image manipulation services.
 */
const processFileFormats = async (fileData, services) => {
  await handleThumbnail(fileData, services.generateThumbnail);
  await handleResponsiveFormats(fileData, services.generateResponsiveFormats);
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
    const services = strapi.plugins.upload.services['image-manipulation'];
    const provider = strapi.plugins.upload.provider;

    await provider.upload(fileData);
    await processFileFormats(fileData, services);

    const { width, height } = await services.getDimensions(fileData.buffer);
    delete fileData.buffer;

    _.assign(fileData, {
      provider: config.provider,
      width,
      height,
    });

    return this.add(fileData, { user });
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
    const services = strapi.plugins.upload.services['image-manipulation'];
    const provider = strapi.plugins.upload.provider;

    const dbFile = await this.fetch({ id });
    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const { fileInfo } = data;
    const fileData = await this.enhanceFile(file, fileInfo);
    _.assign(fileData, { hash: dbFile.hash, ext: dbFile.ext });

    await deleteProviderResources(dbFile, config);

    await provider.upload(fileData);
    _.set(fileData, 'formats', {});

    await processFileFormats(fileData, services);

    const { width, height } = await services.getDimensions(fileData.buffer);
    delete fileData.buffer;

    _.assign(fileData, {
      provider: config.provider,
      width,
      height,
    });

    return this.update({ id }, fileData, { user });
  },

  async update(params, values, { user } = {}) {
    const fileValues = { ...values };
    if (user) {
      fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    }
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').update(params, fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_UPDATE, {
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

  async remove(file) {
    const config = strapi.plugins.upload.config;
    await deleteProviderResources(file, config);

    const media = await strapi.query('file', 'upload').findOne({ id: file.id });
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_DELETE, {
      media: sanitizeEntity(media, { model: modelDef }),
    });

    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;
    const arr = Array.isArray(files) ? files : [files];
    const enhancedFiles = await Promise.all(
      arr.map(file =>
        this.enhanceFile(file, {}, { refId: id, ref: model, source, field })
      )
    );
    await Promise.all(enhancedFiles.map(file => this.uploadFileAndPersist(file)));
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
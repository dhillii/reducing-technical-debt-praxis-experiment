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
 * Sends telemetry events based on media attributes.
 * @param {Object} data
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
 * Adjusts query filters for legacy mime_ncontains handling.
 * @param {Object} params
 */
const combineFilters = params => {
  // FIXME: until we support boolean operators for querying we need to make mime_ncontains use AND instead of OR
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Determines if the file provider matches the configured provider.
 * @param {Object} file
 * @param {Object} config
 * @returns {boolean}
 */
const isSameProvider = (file, config) => file.provider === config.provider;

/**
 * Deletes a file and its associated formats using the upload provider.
 * @param {Object} file
 * @param {Object} config
 */
const deleteFileWithFormats = async (file, config) => {
  const provider = strapi.plugins.upload.provider;
  if (isSameProvider(file, config)) {
    await provider.delete(file);
    if (file.formats) {
      await Promise.all(
        Object.keys(file.formats).map(key => provider.delete(file.formats[key]))
      );
    }
  }
};

/**
 * Handles thumbnail generation and persistence.
 * @param {Object} fileData
 * @param {Object} imageService
 */
const processThumbnail = async (fileData, imageService) => {
  const thumbnail = await imageService.generateThumbnail(fileData);
  if (thumbnail) {
    await strapi.plugins.upload.provider.upload(thumbnail);
    delete thumbnail.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnail);
  }
};

/**
 * Handles responsive format generation and persistence.
 * @param {Object} fileData
 * @param {Object} imageService
 */
const processResponsiveFormats = async (fileData, imageService) => {
  const formats = await imageService.generateResponsiveFormats(fileData);
  if (Array.isArray(formats) && formats.length > 0) {
    for (const fmt of formats) {
      if (!fmt) continue;
      const { key, file } = fmt;
      await strapi.plugins.upload.provider.upload(file);
      delete file.buffer;
      _.set(fileData, ['formats', key], file);
    }
  }
};

/**
 * Finalizes file data by generating dimensions, assigning provider info, and cleaning buffers.
 * @param {Object} fileData
 * @param {Object} config
 * @param {Object} imageService
 */
const finalizeFileData = async (fileData, config, imageService) => {
  await processThumbnail(fileData, imageService);
  await processResponsiveFormats(fileData, imageService);
  const { width, height } = await imageService.getDimensions(fileData.buffer);
  delete fileData.buffer;
  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });
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

    const doUpload = async (file, info) => {
      const fileData = await this.enhanceFile(file, info, metas);
      return this.uploadFileAndPersist(fileData, { user });
    };

    return Promise.all(fileArray.map((file, idx) => doUpload(file, fileInfoArray[idx] || {})));
  },

  async uploadFileAndPersist(fileData, { user } = {}) {
    const config = strapi.plugins.upload.config;
    const imageService = strapi.plugins.upload.services['image-manipulation'];
    const provider = strapi.plugins.upload.provider;

    await provider.upload(fileData);
    await finalizeFileData(fileData, config, imageService);
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
    const imageService = strapi.plugins.upload.services['image-manipulation'];
    const provider = strapi.plugins.upload.provider;

    const dbFile = await this.fetch({ id });
    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const fileData = await this.enhanceFile(file, data.fileInfo);
    _.assign(fileData, { hash: dbFile.hash, ext: dbFile.ext });

    await deleteFileWithFormats(dbFile, config);
    await provider.upload(fileData);
    _.set(fileData, 'formats', {});

    await finalizeFileData(fileData, config, imageService);
    return this.update({ id }, fileData, { user });
  },

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
    await deleteFileWithFormats(file, config);
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
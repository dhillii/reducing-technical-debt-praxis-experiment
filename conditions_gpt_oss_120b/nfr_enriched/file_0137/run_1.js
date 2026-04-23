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
 * Generate a deterministic file name based on the original name.
 */
const generateFileName = name => {
  const baseName = nameToSlug(name, { separator: '_', lowercase: false });
  return `${baseName}_${randomSuffix()}`;
};

/**
 * Send telemetry events based on media attributes.
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
 * Convert legacy mime_ncontains filter to AND based _where clause.
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
 * Optimize image buffer using the image-manipulation service.
 */
const optimizeImage = async buffer => {
  const { optimize } = strapi.plugins.upload.services['image-manipulation'];
  return await optimize(buffer);
};

/**
 * Generate thumbnail and responsive formats, then upload them via the provider.
 */
const processAndUploadFormats = async (fileData, provider) => {
  const {
    generateThumbnail,
    generateResponsiveFormats,
    getDimensions,
  } = strapi.plugins.upload.services['image-manipulation'];

  // Thumbnail
  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    await provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }

  // Responsive formats
  const formats = await generateResponsiveFormats(fileData);
  if (Array.isArray(formats) && formats.length) {
    for (const fmt of formats) {
      if (!fmt) continue;
      const { key, file } = fmt;
      await provider.upload(file);
      delete file.buffer;
      _.set(fileData, ['formats', key], file);
    }
  }

  // Dimensions
  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;
  _.assign(fileData, { width, height });
};

/**
 * Upload a file buffer using the configured provider.
 */
const uploadBuffer = async (fileData, provider) => {
  await provider.upload(fileData);
};

/**
 * Delete a file and its formats from the provider if they belong to the same provider.
 */
const deleteFileAndFormats = async (file, config) => {
  const provider = strapi.plugins.upload.provider;
  if (file.provider !== config.provider) return;

  await provider.delete(file);
  if (file.formats) {
    await Promise.all(
      Object.keys(file.formats).map(key => provider.delete(file.formats[key]))
    );
  }
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
    const readBuffer = await readFileBuffer(file.path);
    const { buffer, info } = await optimizeImage(readBuffer);
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

    const uploadOne = async (file, info) => {
      const fileData = await this.enhanceFile(file, info, metas);
      return this.uploadFileAndPersist(fileData, { user });
    };

    return Promise.all(fileArray.map((f, i) => uploadOne(f, fileInfoArray[i] || {})));
  },

  async uploadFileAndPersist(fileData, { user } = {}) {
    const config = strapi.plugins.upload.config;
    const provider = strapi.plugins.upload.provider;

    await uploadBuffer(fileData, provider);
    await processAndUploadFormats(fileData, provider);

    _.assign(fileData, { provider: config.provider });
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
    const dbFile = await this.fetch({ id });
    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const fileData = await this.enhanceFile(file, data.fileInfo);
    _.assign(fileData, { hash: dbFile.hash, ext: dbFile.ext });

    await deleteFileAndFormats(dbFile, config);
    await uploadBuffer(fileData, strapi.plugins.upload.provider);
    _.set(fileData, 'formats', {});

    await processAndUploadFormats(fileData, strapi.plugins.upload.provider);
    _.assign(fileData, { provider: config.provider });

    return this.update({ id }, fileData, { user });
  },

  async update(params, values, { user } = {}) {
    const fileValues = { ...values };
    if (user) fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    sendMediaMetrics(fileValues);
    const res = await strapi.query('file', 'upload').update(params, fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_UPDATE, { media: sanitizeEntity(res, { model: modelDef }) });
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
    strapi.eventHub.emit(MEDIA_CREATE, { media: sanitizeEntity(res, { model: modelDef }) });
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
    await deleteFileAndFormats(file, config);
    const media = await strapi.query('file', 'upload').findOne({ id: file.id });
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_DELETE, { media: sanitizeEntity(media, { model: modelDef }) });
    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;
    const fileArray = Array.isArray(files) ? files : [files];
    const enhanced = await Promise.all(
      fileArray.map(file =>
        this.enhanceFile(file, {}, { refId: id, ref: model, source, field })
      )
    );
    await Promise.all(enhanced.map(file => this.uploadFileAndPersist(file)));
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
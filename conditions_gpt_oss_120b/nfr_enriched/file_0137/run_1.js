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
 * Convert legacy mime_ncontains filter to AND based _where clause.
 */
const combineFilters = params => {
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Read a file from disk and return its buffer.
 * Throws a Strapi entityTooLarge error if the file exceeds the limit.
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
 * Delete a file and all its format variations from the provider.
 */
const deleteProviderFileAndFormats = async (file, provider) => {
  await provider.delete(file);
  if (file.formats) {
    await Promise.all(
      Object.keys(file.formats).map(key => provider.delete(file.formats[key]))
    );
  }
};

/**
 * Upload a file (or format) to the provider and clean its buffer.
 */
const uploadProviderFile = async (file, provider) => {
  await provider.upload(file);
  delete file.buffer;
};

/**
 * Process image manipulation: thumbnail, responsive formats and dimensions.
 */
const processImageManipulation = async (fileData, imageService, provider) => {
  const { generateThumbnail, generateResponsiveFormats, getDimensions } = imageService;

  const thumbnail = await generateThumbnail(fileData);
  if (thumbnail) {
    await uploadProviderFile(thumbnail, provider);
    _.set(fileData, 'formats.thumbnail', thumbnail);
  }

  const responsive = await generateResponsiveFormats(fileData);
  if (Array.isArray(responsive) && responsive.length) {
    for (const fmt of responsive) {
      if (!fmt) continue;
      const { key, file } = fmt;
      await uploadProviderFile(file, provider);
      _.set(fileData, ['formats', key], file);
    }
  }

  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;
  return { width, height };
};

/**
 * Assign common file metadata after upload.
 */
const assignFileMetadata = (fileData, config, dimensions) => {
  _.assign(fileData, {
    provider: config.provider,
    width: dimensions.width,
    height: dimensions.height,
  });
};

module.exports = {
  /**
   * Build a file entity from raw upload data.
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
   * Enhance a raw file with optimization and formatted metadata.
   */
  async enhanceFile(file, fileInfo = {}, metas = {}) {
    const buffer = await readFileBuffer(file.path);
    const { optimize } = strapi.plugins.upload.services['image-manipulation'];
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
    const infoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

    const uploadOne = async (file, info) => {
      const enhanced = await this.enhanceFile(file, info, metas);
      return this.uploadFileAndPersist(enhanced, { user });
    };

    return Promise.all(fileArray.map((f, i) => uploadOne(f, infoArray[i] || {})));
  },

  /**
   * Persist a file after provider upload and image processing.
   */
  async uploadFileAndPersist(fileData, { user } = {}) {
    const config = strapi.plugins.upload.config;
    const imageService = strapi.plugins.upload.services['image-manipulation'];
    const provider = strapi.plugins.upload.provider;

    await provider.upload(fileData);
    const dimensions = await processImageManipulation(fileData, imageService, provider);
    assignFileMetadata(fileData, config, dimensions);
    return this.add(fileData, { user });
  },

  /**
   * Update basic file information (name, alt text, caption).
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
   * Replace an existing file with a new upload.
   */
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

    if (dbFile.provider === config.provider) {
      await deleteProviderFileAndFormats(dbFile, provider);
    }

    await provider.upload(fileData);
    _.set(fileData, 'formats', {});

    const dimensions = await processImageManipulation(fileData, imageService, provider);
    assignFileMetadata(fileData, config, dimensions);
    return this.update({ id }, fileData, { user });
  },

  /**
   * Generic update helper that also emits telemetry.
   */
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

  /**
   * Generic add helper that also emits telemetry.
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
   * Remove a file and its formats from the provider and DB.
   */
  async remove(file) {
    const config = strapi.plugins.upload.config;
    const provider = strapi.plugins.upload.provider;

    if (file.provider === config.provider) {
      await deleteProviderFileAndFormats(file, provider);
    }

    const media = await strapi.query('file', 'upload').findOne({ id: file.id });
    const modelDef = strapi.getModel('file', 'upload');
    strapi.eventHub.emit(MEDIA_DELETE, {
      media: sanitizeEntity(media, { model: modelDef }),
    });

    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  /**
   * Upload files directly linked to an entity.
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
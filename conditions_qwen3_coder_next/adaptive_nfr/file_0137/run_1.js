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
 * Combines mime_ncontains filters into _where array for AND semantics.
 * @param {Object} params - Query parameters object
 */
const combineFilters = params => {
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Strategy interface for file processing operations.
 */
class FileProcessor {
  /**
   * @param {Object} fileData - File data object
   * @param {Object} config - Upload plugin configuration
   */
  constructor(fileData, config) {
    this.fileData = fileData;
    this.config = config;
  }

  /**
   * Process file formats (thumbnail, responsive).
   * @param {Function} generateThumbnailFn - Function to generate thumbnail
   * @param {Function} generateResponsiveFormatsFn - Function to generate responsive formats
   * @param {Function} getDimensionsFn - Function to get image dimensions
   */
  async processFormats(generateThumbnailFn, generateResponsiveFormatsFn, getDimensionsFn) {
    const thumbnailFile = await generateThumbnailFn(this.fileData);
    if (thumbnailFile) {
      await strapi.plugins.upload.provider.upload(thumbnailFile);
      delete thumbnailFile.buffer;
      _.set(this.fileData, 'formats.thumbnail', thumbnailFile);
    }

    const formats = await generateResponsiveFormatsFn(this.fileData);
    if (Array.isArray(formats) && formats.length > 0) {
      for (const format of formats) {
        if (!format) continue;

        const { key, file } = format;

        await strapi.plugins.upload.provider.upload(file);
        delete file.buffer;

        _.set(this.fileData, ['formats', key], file);
      }
    }

    const { width, height } = await getDimensionsFn(this.fileData.buffer);
    delete this.fileData.buffer;

    _.assign(this.fileData, {
      provider: this.config.provider,
      width,
      height,
    });
  }
}

/**
 * Processor for initial file uploads.
 */
class UploadFileProcessor extends FileProcessor {
  /**
   * @param {Object} fileData - File data object
   * @param {Object} config - Upload plugin configuration
   */
  constructor(fileData, config) {
    super(fileData, config);
  }

  /**
   * Process upload-specific logic.
   * @param {Function} generateThumbnailFn - Function to generate thumbnail
   * @param {Function} generateResponsiveFormatsFn - Function to generate responsive formats
   * @param {Function} getDimensionsFn - Function to get image dimensions
   */
  async process(generateThumbnailFn, generateResponsiveFormatsFn, getDimensionsFn) {
    await strapi.plugins.upload.provider.upload(this.fileData);
    await this.processFormats(generateThumbnailFn, generateResponsiveFormatsFn, getDimensionsFn);
  }
}

/**
 * Processor for file replacements.
 */
class ReplaceFileProcessor extends FileProcessor {
  /**
   * @param {Object} fileData - File data object
   * @param {Object} config - Upload plugin configuration
   * @param {Object} dbFile - Existing database file record
   */
  constructor(fileData, config, dbFile) {
    super(fileData, config);
    this.dbFile = dbFile;
  }

  /**
   * Process replacement-specific logic.
   * @param {Function} generateThumbnailFn - Function to generate thumbnail
   * @param {Function} generateResponsiveFormatsFn - Function to generate responsive formats
   * @param {Function} getDimensionsFn - Function to get image dimensions
   */
  async process(generateThumbnailFn, generateResponsiveFormatsFn, getDimensionsFn) {
    // keep a constant hash
    _.assign(this.fileData, {
      hash: this.dbFile.hash,
      ext: this.dbFile.ext,
    });

    // execute delete function of the provider
    if (this.dbFile.provider === this.config.provider) {
      await strapi.plugins.upload.provider.delete(this.dbFile);

      if (this.dbFile.formats) {
        await Promise.all(
          Object.keys(this.dbFile.formats).map(key => {
            return strapi.plugins.upload.provider.delete(this.dbFile.formats[key]);
          })
        );
      }
    }

    await strapi.plugins.upload.provider.upload(this.fileData);

    // clear old formats
    _.set(this.fileData, 'formats', {});

    await this.processFormats(generateThumbnailFn, generateResponsiveFormatsFn, getDimensionsFn);
  }
}

/**
 * Process file formats and dimensions using the appropriate processor.
 * @param {Object} fileData - File data object
 * @param {Object} config - Upload plugin configuration
 * @param {Object} dbFile - Existing database file record (optional)
 * @returns {Promise<Object>} Processed file data
 */
const processFileData = async (fileData, config, dbFile = null) => {
  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

  const processor = dbFile
    ? new ReplaceFileProcessor(fileData, config, dbFile)
    : new UploadFileProcessor(fileData, config);

  await processor.process(generateThumbnail, generateResponsiveFormats, getDimensions);

  return fileData;
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

    await processFileData(fileData, config);

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

    const { fileInfo } = data;
    const fileData = await this.enhanceFile(file, fileInfo);

    await processFileData(fileData, config, dbFile);

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
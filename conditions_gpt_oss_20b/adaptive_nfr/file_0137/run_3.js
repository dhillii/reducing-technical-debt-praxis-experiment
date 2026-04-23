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

const combineFilters = params => {
  // FIXME: until we support boolean operators for querying we need to make mime_ncontains use AND instead of OR
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

module.exports = {
  /**
   * Formats file information for storage.
   *
   * @param {Object} file - File metadata.
   * @param {Object} fileInfo - Additional file info.
   * @param {Object} metas - Metadata for related entities.
   * @returns {Object} Formatted file entity.
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

  /**
   * Enhances a file by reading its buffer and optimizing it.
   *
   * @param {Object} file - File object.
   * @param {Object} fileInfo - File info.
   * @param {Object} metas - Metadata for related entities.
   * @returns {Promise<Object>} Enhanced file data.
   */
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

  /**
   * Uploads files and persists them.
   *
   * @param {Object} params - Parameters containing data and files.
   * @param {Object} user - User performing the upload.
   * @returns {Promise<Array>} Uploaded file entities.
   */
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

  /**
   * Handles uploading of a single file and persisting it.
   *
   * @param {Object} fileData - Enhanced file data.
   * @param {Object} user - User performing the operation.
   * @returns {Promise<Object>} Persisted file entity.
   */
  async uploadFileAndPersist(fileData, { user } = {}) {
    const config = strapi.plugins.upload.config;

    const {
      getDimensions,
      generateThumbnail,
      generateResponsiveFormats,
    } = strapi.plugins.upload.services['image-manipulation'];

    await strapi.plugins.upload.provider.upload(fileData);

    await this._handleThumbnail(fileData, generateThumbnail);

    await this._handleFormats(fileData, generateResponsiveFormats);

    const { width, height } = await getDimensions(fileData.buffer);
    delete fileData.buffer;

    _.assign(fileData, {
      provider: config.provider,
      width,
      height,
    });

    return this.add(fileData, { user });
  },

  /**
   * Updates file information.
   *
   * @param {Number} id - File ID.
   * @param {Object} updates - Fields to update.
   * @param {Object} user - User performing the update.
   * @returns {Promise<Object>} Updated file entity.
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
   * Replaces an existing file with a new one.
   *
   * @param {Number} id - File ID.
   * @param {Object} data - Data containing file and fileInfo.
   * @param {Object} file - New file object.
   * @param {Object} user - User performing the replace.
   * @returns {Promise<Object>} Updated file entity.
   */
  async replace(id, { data, file }, { user } = {}) {
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

    // keep a constant hash
    _.assign(fileData, {
      hash: dbFile.hash,
      ext: dbFile.ext,
    });

    // delete existing file and formats
    await this._deleteProviderFiles(dbFile);

    await strapi.plugins.upload.provider.upload(fileData);

    // clear old formats
    _.set(fileData, 'formats', {});

    await this._handleThumbnail(fileData, generateThumbnail);

    await this._handleFormats(fileData, generateResponsiveFormats);

    const { width, height } = await getDimensions(fileData.buffer);
    delete fileData.buffer;

    _.assign(fileData, {
      provider: config.provider,
      width,
      height,
    });

    return this.update({ id }, fileData, { user });
  },

  /**
   * Updates a file entity.
   *
   * @param {Object} params - Query parameters.
   * @param {Object} values - Updated values.
   * @param {Object} user - User performing the update.
   * @returns {Promise<Object>} Updated file entity.
   */
  async update(params, values, { user } = {}) {
    const fileValues = { ...values };
    if (user) {
      fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    }
    this._sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').update(params, fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    this._emitEvent(MEDIA_UPDATE, { media: sanitizeEntity(res, { model: modelDef }) });
    return res;
  },

  /**
   * Adds a new file entity.
   *
   * @param {Object} values - File values.
   * @param {Object} user - User performing the add.
   * @returns {Promise<Object>} Created file entity.
   */
  async add(values, { user } = {}) {
    const fileValues = { ...values };
    if (user) {
      fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
      fileValues[CREATED_BY_ATTRIBUTE] = user.id;
    }
    this._sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').create(fileValues);
    const modelDef = strapi.getModel('file', 'upload');
    this._emitEvent(MEDIA_CREATE, { media: sanitizeEntity(res, { model: modelDef }) });
    return res;
  },

  /**
   * Fetches a single file entity.
   *
   * @param {Object} params - Query parameters.
   * @param {Object} populate - Populate options.
   * @returns {Promise<Object>} File entity.
   */
  fetch(params, populate) {
    return strapi.query('file', 'upload').findOne(params, populate);
  },

  /**
   * Fetches all file entities.
   *
   * @param {Object} params - Query parameters.
   * @param {Object} populate - Populate options.
   * @returns {Promise<Array>} File entities.
   */
  fetchAll(params, populate) {
    combineFilters(params);
    return strapi.query('file', 'upload').find(params, populate);
  },

  /**
   * Searches for file entities.
   *
   * @param {Object} params - Search parameters.
   * @param {Object} populate - Populate options.
   * @returns {Promise<Array>} Search results.
   */
  search(params, populate) {
    return strapi.query('file', 'upload').search(params, populate);
  },

  /**
   * Counts search results.
   *
   * @param {Object} params - Search parameters.
   * @returns {Promise<Number>} Count.
   */
  countSearch(params) {
    return strapi.query('file', 'upload').countSearch(params);
  },

  /**
   * Counts file entities.
   *
   * @param {Object} params - Query parameters.
   * @returns {Promise<Number>} Count.
   */
  count(params) {
    combineFilters(params);
    return strapi.query('file', 'upload').count(params);
  },

  /**
   * Removes a file entity.
   *
   * @param {Object} file - File entity to remove.
   * @returns {Promise<Object>} Result of deletion.
   */
  async remove(file) {
    await this._deleteProviderFiles(file);

    const media = await strapi.query('file', 'upload').findOne({
      id: file.id,
    });

    const modelDef = strapi.getModel('file', 'upload');
    this._emitEvent(MEDIA_DELETE, { media: sanitizeEntity(media, { model: modelDef }) });

    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  /**
   * Uploads files to a specific entity.
   *
   * @param {Object} params - Parameters containing id, model, and field.
   * @param {Array|Object} files - Files to upload.
   * @param {String} source - Source of the upload.
   * @returns {Promise<void>}
   */
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

  /**
   * Retrieves upload settings.
   *
   * @returns {Promise<Object>} Settings.
   */
  getSettings() {
    return strapi
      .store({
        type: 'plugin',
        name: 'upload',
        key: 'settings',
      })
      .get();
  },

  /**
   * Sets upload settings.
   *
   * @param {Object} value - Settings value.
   * @returns {Promise<Object>} Result of setting operation.
   */
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

  /**
   * Handles thumbnail generation and upload.
   *
   * @private
   * @param {Object} fileData - File data.
   * @param {Function} generateThumbnail - Thumbnail generator.
   * @returns {Promise<void>}
   */
  async _handleThumbnail(fileData, generateThumbnail) {
    const thumbnailFile = await generateThumbnail(fileData);
    if (thumbnailFile) {
      await strapi.plugins.upload.provider.upload(thumbnailFile);
      delete thumbnailFile.buffer;
      _.set(fileData, 'formats.thumbnail', thumbnailFile);
    }
  },

  /**
   * Handles responsive format generation and upload.
   *
   * @private
   * @param {Object} fileData - File data.
   * @param {Function} generateResponsiveFormats - Format generator.
   * @returns {Promise<void>}
   */
  async _handleFormats(fileData, generateResponsiveFormats) {
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
  },

  /**
   * Deletes a file and its formats from the provider.
   *
   * @private
   * @param {Object} file - File entity.
   * @returns {Promise<void>}
   */
  async _deleteProviderFiles(file) {
    const config = strapi.plugins.upload.config;

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
  },

  /**
   * Emits an event with the given payload.
   *
   * @private
   * @param {String} event - Event name.
   * @param {Object} payload - Event payload.
   */
  _emitEvent(event, payload) {
    strapi.eventHub.emit(event, payload);
  },

  /**
   * Sends media metrics based on file values.
   *
   * @private
   * @param {Object} fileValues - File values.
   */
  _sendMediaMetrics(fileValues) {
    sendMediaMetrics(fileValues);
  },
};
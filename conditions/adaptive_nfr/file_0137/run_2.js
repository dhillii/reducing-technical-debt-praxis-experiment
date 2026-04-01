```javascript
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
 * Sends telemetry metrics for media with caption or alternative text
 * @param {Object} data - Media data object
 */
const sendMediaMetrics = data => {
  const metricStrategies = [
    { field: 'caption', event: 'didSaveMediaWithCaption' },
    { field: 'alternativeText', event: 'didSaveMediaWithAlternativeText' },
  ];

  metricStrategies.forEach(({ field, event }) => {
    if (_.has(data, field) && !_.isEmpty(data[field])) {
      strapi.telemetry.send(event);
    }
  });
};

const combineFilters = params => {
  // FIXME: until we support boolean operators for querying we need to make mime_ncontains use AND instead of OR
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Deletes file formats from provider
 * @param {Object} file - File object with formats
 * @param {string} provider - Provider name
 */
const deleteFileFormats = async (file, provider) => {
  if (!file.formats) {
    return;
  }

  await Promise.all(
    Object.keys(file.formats).map(key => {
      return strapi.plugins.upload.provider.delete(file.formats[key]);
    })
  );
};

/**
 * Processes and uploads responsive formats
 * @param {Object} fileData - File data object
 * @param {Array} formats - Array of format objects
 */
const processResponsiveFormats = async (fileData, formats) => {
  if (!Array.isArray(formats) || formats.length === 0) {
    return;
  }

  for (const format of formats) {
    if (!format) continue;

    const { key, file } = format;

    await strapi.plugins.upload.provider.upload(file);
    delete file.buffer;

    _.set(fileData, ['formats', key], file);
  }
};

/**
 * Processes thumbnail generation and upload
 * @param {Object} fileData - File data object
 * @param {Function} generateThumbnail - Thumbnail generation function
 */
const processThumbnail = async (fileData, generateThumbnail) => {
  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }
};

/**
 * Emits media event to event hub
 * @param {string} eventType - Type of event (MEDIA_CREATE, MEDIA_UPDATE, MEDIA_DELETE)
 * @param {Object} media - Media object
 */
const emitMediaEvent = (eventType, media) => {
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(eventType, { media: sanitizeEntity(media, { model: modelDef }) });
};

/**
 * Applies user attribution to file values
 * @param {Object} fileValues - File values object
 * @param {Object} user - User object
 * @param {boolean} isCreation - Whether this is a creation operation
 */
const applyUserAttribution = (fileValues, user, isCreation = false) => {
  if (!user) {
    return;
  }

  fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
  if (isCreation) {
    fileValues[CREATED_BY_ATTRIBUTE] = user.id;
  }
};

/**
 * Finalizes file data with dimensions and provider info
 * @param {Object} fileData - File data object
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {string} provider - Provider name
 */
const finalizeFileData = (fileData, width, height, provider) => {
  delete fileData.buffer;

  _.assign(fileData, {
    provider,
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

    const {
      getDimensions,
      generateThumbnail,
      generateResponsiveFormats,
    } = strapi.plugins.upload.services['image-manipulation'];

    await strapi.plugins.upload.provider.upload(fileData);

    await processThumbnail(fileData, generateThumbnail);

    const formats = await generateResponsiveFormats(fileData);
    await processResponsiveFormats(fileData, formats);

    const { width, height } = await getDimensions(fileData.buffer);

    finalizeFileData(fileData, width, height, config.provider);

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

    // execute delete function of the provider
    if (dbFile.provider === config.provider) {
      await strapi.plugins.upload.provider.delete(dbFile);
      await deleteFileFormats(dbFile, config.provider);
    }

    await strapi.plugins.upload.provider.upload(fileData);

    // clear old formats
    _.set(fileData, 'formats', {});

    await processThumbnail(fileData, generateThumbnail);

    const formats = await generateResponsiveFormats(fileData);
    await processResponsiveFormats(fileData, formats);

    const { width, height } = await getDimensions(fileData.buffer);

    finalizeFileData(fileData, width, height, config.provider);

    return this.update({ id }, fileData, { user });
  },

  async update(params, values, { user } = {}) {
    const fileValues = { ...values };
    applyUserAttribution(fileValues, user, false);
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').update(params, fileValues);
    emitMediaEvent(MEDIA_UPDATE, res);
    return res;
  },

  async add(values, { user } = {}) {
    const fileValues = { ...values };
    applyUserAttribution(fileValues, user, true);
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').create(fileValues);
    emitMediaEvent(MEDIA_CREATE, res);
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
      await deleteFileFormats(file, config.provider);
    }

    const media = await strapi.query('file', 'upload').findOne({
      id: file.id,
    });

    emitMediaEvent(MEDIA_DELETE, media);

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
    const telemetryEventMap = {
      true: 'didEnableResponsiveDimensions',
      false: 'didDisableResponsiveDimensions',
    };

    const event = telemetryEventMap[value.responsiveDimensions];
    if (event) {
      strapi.telemetry.send(event);
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
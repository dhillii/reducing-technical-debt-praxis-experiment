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
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

// Helper: Read file buffer with error handling
const readFileBuffer = async (filePath) => {
  try {
    return await util.promisify(fs.readFile)(filePath);
  } catch (e) {
    if (e.code === 'ERR_FS_FILE_TOO_LARGE') {
      throw strapi.errors.entityTooLarge('FileTooBig', {
        errors: [
          {
            id: 'Upload.status.sizeLimit',
            message: `${path.basename(filePath)} file is bigger than the limit size!`,
            values: { file: path.basename(filePath) },
          },
        ],
      });
    }
    throw e;
  }
};

// Helper: Generate optimized file data
const optimizeFileBuffer = async (buffer) => {
  const { optimize } = strapi.plugins.upload.services['image-manipulation'];
  return await optimize(buffer);
};

// Helper: Delete file formats from provider
const deleteFileFormats = async (file) => {
  if (file.formats) {
    await Promise.all(
      Object.keys(file.formats).map(key => {
        return strapi.plugins.upload.provider.delete(file.formats[key]);
      })
    );
  }
};

// Helper: Upload thumbnail if generated
const uploadThumbnail = async (fileData) => {
  const { generateThumbnail } = strapi.plugins.upload.services['image-manipulation'];
  const thumbnailFile = await generateThumbnail(fileData);
  
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }
};

// Helper: Upload responsive formats
const uploadResponsiveFormats = async (fileData) => {
  const { generateResponsiveFormats } = strapi.plugins.upload.services['image-manipulation'];
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
};

// Helper: Set file dimensions and provider info
const setFileDimensionsAndProvider = async (fileData) => {
  const config = strapi.plugins.upload.config;
  const { getDimensions } = strapi.plugins.upload.services['image-manipulation'];
  
  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;

  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });
};

// Helper: Emit media event
const emitMediaEvent = (eventType, media) => {
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(eventType, { media: sanitizeEntity(media, { model: modelDef }) });
};

// Helper: Prepare file values with user context
const prepareFileValues = (values, user) => {
  const fileValues = { ...values };
  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
  }
  return fileValues;
};

// Helper: Prepare file values for creation with user context
const prepareFileValuesForCreate = (values, user) => {
  const fileValues = { ...values };
  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
    fileValues[CREATED_BY_ATTRIBUTE] = user.id;
  }
  return fileValues;
};

// Helper: Delete old file and formats from provider
const deleteOldFileAndFormats = async (dbFile, config) => {
  if (dbFile.provider === config.provider) {
    await strapi.plugins.upload.provider.delete(dbFile);
    await deleteFileFormats(dbFile);
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
    const readBuffer = await readFileBuffer(file.path);
    const { buffer, info } = await optimizeFileBuffer(readBuffer);

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
    await strapi.plugins.upload.provider.upload(fileData);

    await uploadThumbnail(fileData);
    await uploadResponsiveFormats(fileData);
    await setFileDimensionsAndProvider(fileData);

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

    // keep a constant hash
    _.assign(fileData, {
      hash: dbFile.hash,
      ext: dbFile.ext,
    });

    // execute delete function of the provider
    await deleteOldFileAndFormats(dbFile, config);

    await strapi.plugins.upload.provider.upload(fileData);

    // clear old formats
    _.set(fileData, 'formats', {});

    await uploadThumbnail(fileData);
    await uploadResponsiveFormats(fileData);
    await setFileDimensionsAndProvider(fileData);

    return this.update({ id }, fileData, { user });
  },

  async update(params, values, { user } = {}) {
    const fileValues = prepareFileValues(values, user);
    sendMediaMetrics(fileValues);

    const res = await strapi.query('file', 'upload').update(params, fileValues);
    emitMediaEvent(MEDIA_UPDATE, res);
    return res;
  },

  async add(values, { user } = {}) {
    const fileValues = prepareFileValuesForCreate(values, user);
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
    await deleteOldFileAndFormats(file, config);

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
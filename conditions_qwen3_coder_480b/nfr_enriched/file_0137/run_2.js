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

/**
 * Formats file information based on input data
 */
const formatFileInfo = ({ filename, type, size }, fileInfo = {}, metas = {}) => {
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
};

/**
 * Reads and optimizes file buffer
 */
const readFileBuffer = async (file) => {
  try {
    return await util.promisify(fs.readFile)(file.path);
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
};

/**
 * Enhances file with additional metadata and optimization
 */
const enhanceFile = async (file, fileInfo = {}, metas = {}) => {
  const readBuffer = await readFileBuffer(file);
  const { optimize } = strapi.plugins.upload.services['image-manipulation'];
  const { buffer, info } = await optimize(readBuffer);
  
  const formattedFile = formatFileInfo(
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
};

/**
 * Processes file upload for a single file
 */
const processSingleUpload = async (file, fileInfo, metas, service) => {
  const fileData = await enhanceFile(file, fileInfo, metas);
  return service.uploadFileAndPersist(fileData);
};

/**
 * Handles file uploads for multiple files
 */
const handleMultipleUploads = async (files, fileInfoArray, metas, service) => {
  const fileArray = Array.isArray(files) ? files : [files];
  
  return await Promise.all(
    fileArray.map((file, idx) => processSingleUpload(file, fileInfoArray[idx] || {}, metas, service))
  );
};

/**
 * Uploads file to storage provider
 */
const uploadToProvider = async (fileData) => {
  await strapi.plugins.upload.provider.upload(fileData);
};

/**
 * Generates and uploads thumbnail for image files
 */
const processThumbnail = async (fileData) => {
  const thumbnailFile = await strapi.plugins.upload.services['image-manipulation'].generateThumbnail(fileData);
  if (thumbnailFile) {
    await uploadToProvider(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }
};

/**
 * Generates and uploads responsive formats for image files
 */
const processResponsiveFormats = async (fileData) => {
  const formats = await strapi.plugins.upload.services['image-manipulation'].generateResponsiveFormats(fileData);
  if (Array.isArray(formats) && formats.length > 0) {
    for (const format of formats) {
      if (!format) continue;

      const { key, file } = format;
      await uploadToProvider(file);
      delete file.buffer;
      _.set(fileData, ['formats', key], file);
    }
  }
};

/**
 * Gets image dimensions and cleans up buffer
 */
const finalizeImageMetadata = async (fileData) => {
  const { width, height } = await strapi.plugins.upload.services['image-manipulation'].getDimensions(fileData.buffer);
  delete fileData.buffer;
  return { width, height };
};

/**
 * Deletes file from storage provider
 */
const deleteFromProvider = async (file) => {
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
};

/**
 * Emits media creation event
 */
const emitMediaCreateEvent = (res) => {
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_CREATE, { media: sanitizeEntity(res, { model: modelDef }) });
};

/**
 * Emits media update event
 */
const emitMediaUpdateEvent = (res) => {
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_UPDATE, { media: sanitizeEntity(res, { model: modelDef }) });
};

/**
 * Emits media delete event
 */
const emitMediaDeleteEvent = async (fileId) => {
  const media = await strapi.query('file', 'upload').findOne({ id: fileId });
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_DELETE, { media: sanitizeEntity(media, { model: modelDef }) });
};

module.exports = {
  formatFileInfo,

  async enhanceFile(file, fileInfo = {}, metas = {}) {
    return enhanceFile(file, fileInfo, metas);
  },

  async upload({ data, files }, { user } = {}) {
    const { fileInfo, ...metas } = data;
    const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];
    
    return handleMultipleUploads(files, fileInfoArray, metas, this);
  },

  async uploadFileAndPersist(fileData, { user } = {}) {
    const config = strapi.plugins.upload.config;

    await uploadToProvider(fileData);
    await processThumbnail(fileData);
    await processResponsiveFormats(fileData);
    
    const { width, height } = await finalizeImageMetadata(fileData);

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
    const dbFile = await this.fetch({ id });

    if (!dbFile) {
      throw strapi.errors.notFound('file not found');
    }

    const { fileInfo } = data;
    const fileData = await enhanceFile(file, fileInfo);

    // keep a constant hash
    _.assign(fileData, {
      hash: dbFile.hash,
      ext: dbFile.ext,
    });

    await deleteFromProvider(dbFile);

    await uploadToProvider(fileData);

    // clear old formats
    _.set(fileData, 'formats', {});

    await processThumbnail(fileData);
    await processResponsiveFormats(fileData);
    
    const { width, height } = await finalizeImageMetadata(fileData);

    _.assign(fileData, {
      provider: strapi.plugins.upload.config.provider,
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
    emitMediaUpdateEvent(res);
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
    emitMediaCreateEvent(res);
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
    await deleteFromProvider(file);
    await emitMediaDeleteEvent(file.id);
    return strapi.query('file', 'upload').delete({ id: file.id });
  },

  async uploadToEntity(params, files, source) {
    const { id, model, field } = params;

    const arr = Array.isArray(files) ? files : [files];
    const enhancedFiles = await Promise.all(
      arr.map(file => {
        return enhanceFile(
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
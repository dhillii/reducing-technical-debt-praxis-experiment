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

/**
 * Generates a random suffix for a file name.
 * @returns {string} A random suffix.
 */
const randomSuffix = () => crypto.randomBytes(5).toString('hex');

/**
 * Generates a file name based on the provided name.
 * @param {string} name The name to generate the file name from.
 * @returns {string} The generated file name.
 */
const generateFileName = name => {
  const baseName = nameToSlug(name, { separator: '_', lowercase: false });

  return `${baseName}_${randomSuffix()}`;
};

/**
 * Sends media metrics based on the provided data.
 * @param {object} data The data to send metrics for.
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
 * Combines filters for querying.
 * @param {object} params The parameters to combine filters for.
 */
const combineFilters = params => {
  // FIXME: until we support boolean operators for querying we need to make mime_ncontains use AND instead of OR
  if (_.has(params, 'mime_ncontains') && Array.isArray(params.mime_ncontains)) {
    params._where = params.mime_ncontains.map(val => ({ mime_ncontains: val }));
    delete params.mime_ncontains;
  }
};

/**
 * Formats file information.
 * @param {object} fileInfo The file information to format.
 * @param {object} metas The metadata to include in the formatted file information.
 * @returns {object} The formatted file information.
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
 * Enhances a file by optimizing its buffer and generating a thumbnail.
 * @param {object} file The file to enhance.
 * @param {object} fileInfo The file information to include in the enhanced file.
 * @param {object} metas The metadata to include in the enhanced file.
 * @returns {object} The enhanced file.
 */
const enhanceFile = async (file, fileInfo = {}, metas = {}) => {
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
 * Uploads a file to the provider.
 * @param {object} fileData The file data to upload.
 * @param {object} options The options to include in the upload.
 * @returns {object} The uploaded file.
 */
const uploadFileToProvider = async (fileData, options = {}) => {
  const config = strapi.plugins.upload.config;

  await strapi.plugins.upload.provider.upload(fileData);

  return fileData;
};

/**
 * Generates a thumbnail for a file.
 * @param {object} fileData The file data to generate a thumbnail for.
 * @returns {object} The thumbnail file data.
 */
const generateThumbnail = async fileData => {
  const { generateThumbnail: generateThumbnailService } = strapi.plugins.upload.services['image-manipulation'];

  const thumbnailFile = await generateThumbnailService(fileData);
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    return thumbnailFile;
  }
};

/**
 * Generates responsive formats for a file.
 * @param {object} fileData The file data to generate responsive formats for.
 * @returns {object[]} The responsive formats.
 */
const generateResponsiveFormats = async fileData => {
  const { generateResponsiveFormats: generateResponsiveFormatsService } = strapi.plugins.upload.services['image-manipulation'];

  const formats = await generateResponsiveFormatsService(fileData);
  if (Array.isArray(formats) && formats.length > 0) {
    for (const format of formats) {
      if (!format) continue;

      const { key, file } = format;

      await strapi.plugins.upload.provider.upload(file);
      delete file.buffer;

      _.set(fileData, ['formats', key], file);
    }
  }
  return formats;
};

/**
 * Gets the dimensions of a file.
 * @param {object} fileData The file data to get dimensions for.
 * @returns {object} The dimensions of the file.
 */
const getDimensions = async fileData => {
  const { getDimensions: getDimensionsService } = strapi.plugins.upload.services['image-manipulation'];

  return await getDimensionsService(fileData.buffer);
};

/**
 * Uploads a file and persists it to the database.
 * @param {object} fileData The file data to upload and persist.
 * @param {object} options The options to include in the upload and persist.
 * @returns {object} The uploaded and persisted file.
 */
const uploadFileAndPersist = async (fileData, options = {}) => {
  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }

  await generateResponsiveFormats(fileData);

  const { width, height } = await getDimensions(fileData);
  delete fileData.buffer;

  _.assign(fileData, {
    provider: strapi.plugins.upload.config.provider,
    width,
    height,
  });

  return add(fileData, options);
};

/**
 * Uploads files.
 * @param {object} params The parameters to include in the upload.
 * @param {object} options The options to include in the upload.
 * @returns {object[]} The uploaded files.
 */
const uploadFiles = async (params, options = {}) => {
  const { data, files } = params;

  const { fileInfo, ...metas } = data;

  const fileArray = Array.isArray(files) ? files : [files];
  const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

  const doUpload = async (file, fileInfo) => {
    const fileData = await enhanceFile(file, fileInfo, metas);

    return uploadFileAndPersist(fileData, options);
  };

  return await Promise.all(
    fileArray.map((file, idx) => doUpload(file, fileInfoArray[idx] || {}))
  );
};

/**
 * Updates a file.
 * @param {object} params The parameters to include in the update.
 * @param {object} values The values to update the file with.
 * @param {object} options The options to include in the update.
 * @returns {object} The updated file.
 */
const updateFile = async (params, values, options = {}) => {
  const fileValues = { ...values };
  if (options.user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = options.user.id;
  }
  sendMediaMetrics(fileValues);

  const res = await strapi.query('file', 'upload').update(params, fileValues);
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_UPDATE, { media: sanitizeEntity(res, { model: modelDef }) });
  return res;
};

/**
 * Adds a file.
 * @param {object} values The values to add the file with.
 * @param {object} options The options to include in the add.
 * @returns {object} The added file.
 */
const addFile = async (values, options = {}) => {
  const fileValues = { ...values };
  if (options.user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = options.user.id;
    fileValues[CREATED_BY_ATTRIBUTE] = options.user.id;
  }
  sendMediaMetrics(fileValues);

  const res = await strapi.query('file', 'upload').create(fileValues);
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_CREATE, { media: sanitizeEntity(res, { model: modelDef }) });
  return res;
};

/**
 * Fetches a file.
 * @param {object} params The parameters to include in the fetch.
 * @param {object} populate The populate options to include in the fetch.
 * @returns {object} The fetched file.
 */
const fetchFile = (params, populate) => {
  return strapi.query('file', 'upload').findOne(params, populate);
};

/**
 * Fetches all files.
 * @param {object} params The parameters to include in the fetch.
 * @param {object} populate The populate options to include in the fetch.
 * @returns {object[]} The fetched files.
 */
const fetchAllFiles = (params, populate) => {
  combineFilters(params);
  return strapi.query('file', 'upload').find(params, populate);
};

/**
 * Searches for files.
 * @param {object} params The parameters to include in the search.
 * @param {object} populate The populate options to include in the search.
 * @returns {object[]} The searched files.
 */
const searchFiles = (params, populate) => {
  return strapi.query('file', 'upload').search(params, populate);
};

/**
 * Counts the search results for files.
 * @param {object} params The parameters to include in the count.
 * @returns {number} The count of search results.
 */
const countSearchResults = params => {
  return strapi.query('file', 'upload').countSearch(params);
};

/**
 * Counts the files.
 * @param {object} params The parameters to include in the count.
 * @returns {number} The count of files.
 */
const countFiles = params => {
  combineFilters(params);
  return strapi.query('file', 'upload').count(params);
};

/**
 * Removes a file.
 * @param {object} file The file to remove.
 * @returns {object} The removed file.
 */
const removeFile = async file => {
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
};

/**
 * Uploads files to an entity.
 * @param {object} params The parameters to include in the upload.
 * @param {object} files The files to upload.
 * @param {string} source The source of the upload.
 * @returns {object[]} The uploaded files.
 */
const uploadFilesToEntity = async (params, files, source) => {
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

  await Promise.all(enhancedFiles.map(file => uploadFileAndPersist(file)));
};

/**
 * Gets the settings for the upload plugin.
 * @returns {object} The settings for the upload plugin.
 */
const getSettings = () => {
  return strapi
    .store({
      type: 'plugin',
      name: 'upload',
      key: 'settings',
    })
    .get();
};

/**
 * Sets the settings for the upload plugin.
 * @param {object} value The value to set the settings to.
 * @returns {object} The set settings.
 */
const setSettings = value => {
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
};

module.exports = {
  formatFileInfo,
  enhanceFile,
  uploadFileToProvider,
  generateThumbnail,
  generateResponsiveFormats,
  getDimensions,
  uploadFileAndPersist,
  uploadFiles,
  updateFile,
  addFile,
  fetchFile,
  fetchAllFiles,
  searchFiles,
  countSearchResults,
  countFiles,
  removeFile,
  uploadFilesToEntity,
  getSettings,
  setSettings,
};
```
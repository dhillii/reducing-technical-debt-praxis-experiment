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
 * @param {object} metas The metadata for the file.
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
 * Enhances a file by optimizing and formatting its information.
 * @param {object} file The file to enhance.
 * @param {object} fileInfo The file information to enhance.
 * @param {object} metas The metadata for the file.
 * @returns {object} The enhanced file information.
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
 * Uploads a file and persists it to the database.
 * @param {object} fileData The file data to upload and persist.
 * @param {object} options The options for the upload and persist operation.
 * @returns {object} The uploaded and persisted file data.
 */
const uploadFileAndPersist = async (fileData, { user } = {}) => {
  const config = strapi.plugins.upload.config;

  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

  await strapi.plugins.upload.provider.upload(fileData);

  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }

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

  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;

  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });

  return add(fileData, { user });
};

/**
 * Uploads a file.
 * @param {object} params The parameters for the upload operation.
 * @param {object} options The options for the upload operation.
 * @returns {object} The uploaded file data.
 */
const upload = async ({ data, files }, { user } = {}) => {
  const { fileInfo, ...metas } = data;

  const fileArray = Array.isArray(files) ? files : [files];
  const fileInfoArray = Array.isArray(fileInfo) ? fileInfo : [fileInfo];

  const doUpload = async (file, fileInfo) => {
    const fileData = await enhanceFile(file, fileInfo, metas);

    return uploadFileAndPersist(fileData, { user });
  };

  return await Promise.all(
    fileArray.map((file, idx) => doUpload(file, fileInfoArray[idx] || {}))
  );
};

/**
 * Updates a file's information.
 * @param {object} id The ID of the file to update.
 * @param {object} values The new values for the file.
 * @param {object} options The options for the update operation.
 * @returns {object} The updated file data.
 */
const updateFileInfo = async (id, { name, alternativeText, caption }, { user } = {}) => {
  const dbFile = await fetch({ id });

  if (!dbFile) {
    throw strapi.errors.notFound('file not found');
  }

  const newInfos = {
    name: _.isNil(name) ? dbFile.name : name,
    alternativeText: _.isNil(alternativeText) ? dbFile.alternativeText : alternativeText,
    caption: _.isNil(caption) ? dbFile.caption : caption,
  };

  return update({ id }, newInfos, { user });
};

/**
 * Replaces a file.
 * @param {object} id The ID of the file to replace.
 * @param {object} data The new data for the file.
 * @param {object} file The new file to replace with.
 * @param {object} options The options for the replace operation.
 * @returns {object} The replaced file data.
 */
const replace = async (id, { data, file }, { user } = {}) => {
  const config = strapi.plugins.upload.config;

  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

  const dbFile = await fetch({ id });

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

  // execute delete function of the provider
  if (dbFile.provider === config.provider) {
    await strapi.plugins.upload.provider.delete(dbFile);

    if (dbFile.formats) {
      await Promise.all(
        Object.keys(dbFile.formats).map(key => {
          return strapi.plugins.upload.provider.delete(dbFile.formats[key]);
        })
      );
    }
  }

  await strapi.plugins.upload.provider.upload(fileData);

  // clear old formats
  _.set(fileData, 'formats', {});

  const thumbnailFile = await generateThumbnail(fileData);
  if (thumbnailFile) {
    await strapi.plugins.upload.provider.upload(thumbnailFile);
    delete thumbnailFile.buffer;
    _.set(fileData, 'formats.thumbnail', thumbnailFile);
  }

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

  const { width, height } = await getDimensions(fileData.buffer);
  delete fileData.buffer;

  _.assign(fileData, {
    provider: config.provider,
    width,
    height,
  });

  return update({ id }, fileData, { user });
};

/**
 * Updates a file.
 * @param {object} params The parameters for the update operation.
 * @param {object} values The new values for the file.
 * @param {object} options The options for the update operation.
 * @returns {object} The updated file data.
 */
const update = async (params, values, { user } = {}) => {
  const fileValues = { ...values };
  if (user) {
    fileValues[UPDATED_BY_ATTRIBUTE] = user.id;
  }
  sendMediaMetrics(fileValues);

  const res = await strapi.query('file', 'upload').update(params, fileValues);
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_UPDATE, { media: sanitizeEntity(res, { model: modelDef }) });
  return res;
};

/**
 * Adds a new file.
 * @param {object} values The values for the new file.
 * @param {object} options The options for the add operation.
 * @returns {object} The added file data.
 */
const add = async (values, { user } = {}) => {
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
};

/**
 * Fetches a file by ID.
 * @param {object} params The parameters for the fetch operation.
 * @param {object} populate The populate options for the fetch operation.
 * @returns {object} The fetched file data.
 */
const fetch = (params, populate) => {
  return strapi.query('file', 'upload').findOne(params, populate);
};

/**
 * Fetches all files.
 * @param {object} params The parameters for the fetch operation.
 * @param {object} populate The populate options for the fetch operation.
 * @returns {object} The fetched file data.
 */
const fetchAll = (params, populate) => {
  combineFilters(params);
  return strapi.query('file', 'upload').find(params, populate);
};

/**
 * Searches for files.
 * @param {object} params The parameters for the search operation.
 * @param {object} populate The populate options for the search operation.
 * @returns {object} The searched file data.
 */
const search = (params, populate) => {
  return strapi.query('file', 'upload').search(params, populate);
};

/**
 * Counts the number of files that match the search parameters.
 * @param {object} params The parameters for the count operation.
 * @returns {number} The number of files that match the search parameters.
 */
const countSearch = params => {
  return strapi.query('file', 'upload').countSearch(params);
};

/**
 * Counts the number of files that match the parameters.
 * @param {object} params The parameters for the count operation.
 * @returns {number} The number of files that match the parameters.
 */
const count = (params) => {
  combineFilters(params);
  return strapi.query('file', 'upload').count(params);
};

/**
 * Removes a file.
 * @param {object} file The file to remove.
 * @returns {object} The removed file data.
 */
const remove = async (file) => {
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
 * Uploads a file to an entity.
 * @param {object} params The parameters for the upload operation.
 * @param {object} files The files to upload.
 * @param {string} source The source of the upload operation.
 * @returns {object} The uploaded file data.
 */
const uploadToEntity = async (params, files, source) => {
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
 * @param {object} value The new settings for the upload plugin.
 * @returns {object} The updated settings for the upload plugin.
 */
const setSettings = (value) => {
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
  uploadFileAndPersist,
  upload,
  updateFileInfo,
  replace,
  update,
  add,
  fetch,
  fetchAll,
  search,
  countSearch,
  count,
  remove,
  uploadToEntity,
  getSettings,
  setSettings,
};
```
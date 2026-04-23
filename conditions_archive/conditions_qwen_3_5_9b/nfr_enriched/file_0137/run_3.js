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

const generateFileFormats = async (fileData) => {
  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

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
    provider: strapi.plugins.upload.config.provider,
    width,
    height,
  });

  return fileData;
};

const cleanupOldFormats = async (file) => {
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

const updateMediaRecord = async (params, values, { user } = {}) => {
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

const createMediaRecord = async (values, { user } = {}) => {
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

const fetchMedia = (params, populate) => {
  return strapi.query('file', 'upload').findOne(params, populate);
};

const deleteMediaRecord = async (file) => {
  const media = await fetchMedia({ id: file.id });
  const modelDef = strapi.getModel('file', 'upload');
  strapi.eventHub.emit(MEDIA_DELETE, { media: sanitizeEntity(media, { model: modelDef }) });

  return strapi.query('file', 'upload').delete({ id: file.id });
};

const uploadFileAndPersist = async (fileData, { user } = {}) => {
  await strapi.plugins.upload.provider.upload(fileData);
  await generateFileFormats(fileData);
  return createMediaRecord(fileData, { user });
};

const updateFileInfo = async (id, { name, alternativeText, caption }, { user } = {}) => {
  const dbFile = await fetchMedia({ id });

  if (!dbFile) {
    throw strapi.errors.notFound('file not found');
  }

  const newInfos = {
    name: _.isNil(name) ? dbFile.name : name,
    alternativeText: _.isNil(alternativeText) ? dbFile.alternativeText : alternativeText,
    caption: _.isNil(caption) ? dbFile.caption : caption,
  };

  return updateMediaRecord({ id }, newInfos, { user });
};

const replace = async (id, { data, file }, { user } = {}) => {
  const config = strapi.plugins.upload.config;

  const {
    getDimensions,
    generateThumbnail,
    generateResponsiveFormats,
  } = strapi.plugins.upload.services['image-manipulation'];

  const dbFile = await fetchMedia({ id });

  if (!dbFile) {
    throw strapi.errors.notFound('file not found');
  }

  const { fileInfo } = data;
  const fileData = await enhanceFile(file, fileInfo);

  _.assign(fileData, {
    hash: dbFile.hash,
    ext: dbFile.ext,
  });

  await cleanupOldFormats(dbFile);

  await strapi.plugins.upload.provider.upload(fileData);

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

  return updateMediaRecord({ id }, fileData, { user });
};

const remove = async (file) => {
  const config = strapi.plugins.upload.config;

  await cleanupOldFormats(file);

  await deleteMediaRecord(file);
};

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

const getSettings = () => {
  return strapi
    .store({
      type: 'plugin',
      name: 'upload',
      key: 'settings',
    })
    .get();
};

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
  updateFileInfo,
  replace,
  updateMediaRecord,
  createMediaRecord,
  fetchMedia,
  deleteMediaRecord,
  cleanupOldFormats,
  generateFileFormats,
  remove,
  uploadToEntity,
  getSettings,
  setSettings,
  fetchAll: (params, populate) => {
    combineFilters(params);
    return strapi.query('file', 'upload').find(params, populate);
  },
  search: (params, populate) => {
    return strapi.query('file', 'upload').search(params, populate);
  },
  countSearch: (params) => {
    return strapi.query('file', 'upload').countSearch(params);
  },
  count: (params) => {
    combineFilters(params);
    return strapi.query('file', 'upload').count(params);
  },
  add: createMediaRecord,
  upload: async ({ data, files }, { user } = {}) => {
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
  },
};
```
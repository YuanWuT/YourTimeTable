"use strict";Object.defineProperty(exports, "__esModule", {value: true});






















var _chunkYTD42NT4cjs = require('./chunk-YTD42NT4.cjs');

// src/http/errors.ts
function shouldClearCredentials(error) {
  return error.kind === "unauthenticated" || error.code === "invalid_grant";
}
_chunkYTD42NT4cjs.__name.call(void 0, shouldClearCredentials, "shouldClearCredentials");























exports.AuthModule = _chunkYTD42NT4cjs.AuthModule; exports.CLOUD_MODULE_PATHS = _chunkYTD42NT4cjs.CLOUD_MODULE_PATHS; exports.CLOUD_PATH_PREFIX = _chunkYTD42NT4cjs.CLOUD_PATH_PREFIX; exports.CloudOpenAIError = _chunkYTD42NT4cjs.CloudOpenAIError; exports.CloudStoragePathError = _chunkYTD42NT4cjs.CloudStoragePathError; exports.DEFAULT_SIGNED_URL_TTL_SECONDS = _chunkYTD42NT4cjs.DEFAULT_SIGNED_URL_TTL_SECONDS; exports.LlmModule = _chunkYTD42NT4cjs.LlmModule; exports.MAX_SIGNED_URL_TTL_SECONDS = _chunkYTD42NT4cjs.MAX_SIGNED_URL_TTL_SECONDS; exports.PUBLISHABLE_KEY_HEADER = _chunkYTD42NT4cjs.PUBLISHABLE_KEY_HEADER; exports.RUNTIME_STORAGE_BUCKET = _chunkYTD42NT4cjs.RUNTIME_STORAGE_BUCKET; exports.WorkBuddyCloudClient = _chunkYTD42NT4cjs.WorkBuddyCloudClient; exports.WorkBuddyCloudConfigError = _chunkYTD42NT4cjs.WorkBuddyCloudConfigError; exports.WorkBuddyDatabaseModule = _chunkYTD42NT4cjs.WorkBuddyDatabaseModule; exports.WorkBuddyStorageBucket = _chunkYTD42NT4cjs.WorkBuddyStorageBucket; exports.WorkBuddyStorageDownload = _chunkYTD42NT4cjs.WorkBuddyStorageDownload; exports.WorkBuddyStorageModule = _chunkYTD42NT4cjs.WorkBuddyStorageModule; exports.anonymousTokenProvider = _chunkYTD42NT4cjs.anonymousTokenProvider; exports.createMemoryStorage = _chunkYTD42NT4cjs.createMemoryStorage; exports.createWorkBuddyCloud = _chunkYTD42NT4cjs.createWorkBuddyCloud; exports.getModelCapability = _chunkYTD42NT4cjs.getModelCapability; exports.getModelDisplayName = _chunkYTD42NT4cjs.getModelDisplayName; exports.shouldClearCredentials = shouldClearCredentials;

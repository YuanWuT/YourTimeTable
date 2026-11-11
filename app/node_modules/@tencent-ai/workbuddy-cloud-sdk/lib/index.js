import {
  AuthModule,
  CLOUD_MODULE_PATHS,
  CLOUD_PATH_PREFIX,
  CloudOpenAIError,
  CloudStoragePathError,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  LlmModule,
  MAX_SIGNED_URL_TTL_SECONDS,
  PUBLISHABLE_KEY_HEADER,
  RUNTIME_STORAGE_BUCKET,
  WorkBuddyCloudClient,
  WorkBuddyCloudConfigError,
  WorkBuddyDatabaseModule,
  WorkBuddyStorageBucket,
  WorkBuddyStorageDownload,
  WorkBuddyStorageModule,
  __name,
  anonymousTokenProvider,
  createMemoryStorage,
  createWorkBuddyCloud,
  getModelCapability,
  getModelDisplayName
} from "./chunk-VB3AB5XH.js";

// src/http/errors.ts
function shouldClearCredentials(error) {
  return error.kind === "unauthenticated" || error.code === "invalid_grant";
}
__name(shouldClearCredentials, "shouldClearCredentials");
export {
  AuthModule,
  CLOUD_MODULE_PATHS,
  CLOUD_PATH_PREFIX,
  CloudOpenAIError,
  CloudStoragePathError,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  LlmModule,
  MAX_SIGNED_URL_TTL_SECONDS,
  PUBLISHABLE_KEY_HEADER,
  RUNTIME_STORAGE_BUCKET,
  WorkBuddyCloudClient,
  WorkBuddyCloudConfigError,
  WorkBuddyDatabaseModule,
  WorkBuddyStorageBucket,
  WorkBuddyStorageDownload,
  WorkBuddyStorageModule,
  anonymousTokenProvider,
  createMemoryStorage,
  createWorkBuddyCloud,
  getModelCapability,
  getModelDisplayName,
  shouldClearCredentials
};

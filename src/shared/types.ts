// ============================================================
// AI去水印 - 共享类型定义
// ============================================================

// ==================== 消息类型 ====================

// 下载消息
export interface DownloadMessage {
  action: 'DOWNLOAD';
  url: string;
  filename?: string;
  title?: string;
  videoId?: string;
}

export interface DownloadVideoMessage {
  action: 'download_video';
  url: string;
  title?: string;
}

export interface DownloadFileMessage {
  type: 'downloadFile';
  url: string;
  filename?: string;
  title?: string;
}

export interface DownloadImageMessage {
  type: 'downloadImage';
  url: string;
  filename?: string;
}

// 视频数据
export interface VideoDataExtractedMessage {
  type: 'videoDataExtracted';
  data: VideoInfo[];
}

export interface GetVideoListMessage {
  type: 'GET_VIDEO_LIST';
}

export interface ClearVideoListMessage {
  type: 'CLEAR_VIDEO_LIST';
}

export interface StartVideoDownloadMessage {
  type: 'startVideoDownload';
}

export interface VideoDownloadResultMessage {
  type: 'videoDownloadResult';
  data: VideoDownloadResult;
}

// 站点模块
export interface GetSiteModulesMessage {
  type: 'GET_SITE_MODULES';
}

export interface SiteModulesResponse {
  success: boolean;
  modules: SiteModules;
}

// 15s 时长
export interface Get15sStateMessage {
  type: 'GET_15S_STATE';
}

export interface Set15sEnabledMessage {
  type: 'SET_15S_ENABLED';
  value: boolean;
}

// 文件名模板
export interface GetFilenameTemplateMessage {
  type: 'GET_FILENAME_TEMPLATE';
}

export interface SetFilenameTemplateMessage {
  type: 'SET_FILENAME_TEMPLATE';
  template: string;
}

// 归档目录
export interface GetArchivePrefixMessage {
  type: 'GET_ARCHIVE_PREFIX';
}

export interface SetArchivePrefixMessage {
  type: 'SET_ARCHIVE_PREFIX';
  prefix: string;
}

// 通知
export interface ConsumeNotificationsMessage {
  type: 'CONSUME_NOTIFICATIONS';
}

// 下载进度
export interface DownloadProgressMessage {
  type: 'DOWNLOAD_PROGRESS';
  downloadId: number;
  percent: number;
  state: 'in_progress' | 'complete' | 'interrupted';
}

// 联合消息类型
export type ChromeMessage =
  | DownloadMessage
  | DownloadVideoMessage
  | DownloadFileMessage
  | DownloadImageMessage
  | VideoDataExtractedMessage
  | GetVideoListMessage
  | ClearVideoListMessage
  | StartVideoDownloadMessage
  | VideoDownloadResultMessage
  | GetSiteModulesMessage
  | Get15sStateMessage
  | Set15sEnabledMessage
  | GetFilenameTemplateMessage
  | SetFilenameTemplateMessage
  | GetArchivePrefixMessage
  | SetArchivePrefixMessage
  | ConsumeNotificationsMessage
  | DownloadProgressMessage;

// ==================== 数据类型 ====================

export interface VideoInfo {
  vid: string;
  messageId?: string;
  url?: string;
}

export interface VideoDownloadResult {
  success: boolean;
  videoUrl?: string;
  backupUrl?: string;
  vid?: string;
  messageId?: string;
  width?: number;
  height?: number;
  definition?: string;
  source?: string;
  error?: string;
}

export interface SiteModules {
  dreamina: boolean;
  doubao: boolean;
  jimeng: boolean;
  xyq: boolean;
  qianwen: boolean;
  klingai: boolean;
  vidu: boolean;
  pixverse: boolean;
}

export interface NotificationEntry {
  level: 'error' | 'warn' | 'info';
  msg: string;
  context: string;
  time: number;
}

export interface CapturedMedia {
  url: string;
  name?: string;
  id?: string;
  tag?: string;
  creator?: string;
  cover?: string;
  addedAt: number;
}

// ==================== 常量 ====================

export const STORAGE_KEYS = {
  VIDEO_LIST: 'videoList',
  NOTIFICATIONS: 'notifications',
  SITE_MODULES: 'site_modules',
  THEME: 'theme_preference',
  FILENAME_TEMPLATE: 'filenameTemplate',
  ARCHIVE_PREFIX: 'archivePrefix',
  DEDUP_ENABLED: 'dedup_enabled',
  AIWM_D15_ENABLED: 'aiwm_d15_enabled',
  XQ_D15_DURATION: 'codex_doubao_video_duration_choice',
  DOWNLOADED_IMAGES: 'doubao_downloaded_images',
} as const;

export const DEFAULTS = {
  FILENAME_TEMPLATE: '{site}_{date}_{idx}.{ext}' as string,
  ARCHIVE_PREFIX: 'AI去水印' as string,
  VIDEO_LIST_MAX_SIZE: 500,
  DEDUP_TTL: 60_000,
  DEDUP_MAX_SIZE: 200,
  NOTIFY_MAX: 20,
  RETRY_MAX: 3,
  RETRY_DELAY_BASE: 1000,
};

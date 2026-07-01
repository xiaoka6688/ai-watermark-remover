// ============================================================
// AI去水印 - 核心工具函数（TypeScript 版本）
// 从 lib/utils.js 迁移，增加类型安全
// ============================================================
import { DEFAULTS } from './types';

// ==================== 文件名模板解析 ====================

export const DEFAULT_FILENAME_TEMPLATE = DEFAULTS.FILENAME_TEMPLATE;
let _filenameCounter = 0;

export interface FormatFilenameData {
  site?: string;
  title?: string;
  ext?: string;
  id?: string;
  url?: string;
  idx?: number;
  archivePrefix?: string;
  _now?: Date;
}

export function formatFilename(data: FormatFilenameData, template?: string): string {
  template = template || DEFAULT_FILENAME_TEMPLATE;
  const now = data._now || new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  _filenameCounter++;
  const idx = String(data.idx || _filenameCounter).padStart(2, '0');

  const safe = (s: string | undefined): string =>
    String(s || '')
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 50);

  const site = safe(data.site) || 'download';

  const vars: Record<string, string> = {
    site,
    title: safe(data.title) || '',
    date,
    time,
    idx,
    ext: data.ext || 'mp4',
    id: safe(data.id) || '',
  };

  let filename = template;
  for (const [key, val] of Object.entries(vars)) {
    filename = filename.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }

  // 清理连续下划线和空标题产生的多余分隔符
  filename = filename
    .replace(/_+/g, '_')
    .replace(/^_/, '')
    .replace(/_\./g, '.')
    .replace(/\.\./g, '.');

  // 归档目录：{prefix}/{site}/{date}/filename
  const prefix = safe(data.archivePrefix) || 'AI去水印';
  return `${prefix}/${site}/${date}/${filename}`;
}

// ==================== 下载去重 ====================

export interface DedupChecker {
  isDuplicateDownload: (url: string, now?: number) => boolean;
  getSize: () => number;
  clear: () => void;
}

export function createDedupChecker(
  ttl: number = DEFAULTS.DEDUP_TTL,
  maxSize: number = DEFAULTS.DEDUP_MAX_SIZE
): DedupChecker {
  const downloadedUrls = new Map<string, number>();

  function isDuplicateDownload(url: string, now?: number): boolean {
    now = now || Date.now();
    if (!url) return false;

    // 清理过期条目
    if (downloadedUrls.size > maxSize / 2) {
      for (const [k, expireAt] of downloadedUrls) {
        if (expireAt < now) downloadedUrls.delete(k);
      }
    }

    if (downloadedUrls.has(url) && downloadedUrls.get(url)! > now) {
      return true;
    }
    downloadedUrls.set(url, now + ttl);
    return false;
  }

  return {
    isDuplicateDownload,
    getSize: () => downloadedUrls.size,
    clear: () => downloadedUrls.clear(),
  };
}

// ==================== JSON 递归搜索 ====================

export function findAllKeysInJson<T = unknown>(
  obj: unknown,
  targetKey: string,
  results?: T[]
): T[] {
  if (!results) results = [];
  if (!obj || typeof obj !== 'object') return results;

  if (Array.isArray(obj)) {
    obj.forEach((item) => findAllKeysInJson(item, targetKey, results));
  } else {
    const record = obj as Record<string, unknown>;
    for (const key in record) {
      if (key === targetKey) {
        results.push(record[key] as T);
      }
      if (typeof record[key] === 'object') {
        findAllKeysInJson(record[key], targetKey, results);
      }
    }
  }
  return results;
}

// ==================== 豆包图片提取 ====================

export function extractImageUrlsFromCreations(json: unknown): string[] {
  const urls: string[] = [];
  const creations = findAllKeysInJson<unknown[]>(json, 'creations');
  if (!creations || creations.length === 0) return urls;

  for (const creationGroup of creations) {
    if (!Array.isArray(creationGroup)) continue;
    for (const item of creationGroup) {
      const rawUrl = (item as Record<string, unknown>)?.image &&
        ((item as Record<string, unknown>).image as Record<string, unknown>)?.image_ori_raw &&
        (((item as Record<string, unknown>).image as Record<string, unknown>).image_ori_raw as Record<string, unknown>)?.url;
      if (rawUrl && typeof rawUrl === 'string') urls.push(rawUrl);
    }
  }
  return urls;
}

// ==================== 15s 时长请求体改写 ====================

export const TARGET_DURATION = 15;
export const TARGET_MODEL = 'seedance_v2.0';

export function parseAbilityParam(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return { ...(value as Record<string, unknown>) };
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

export interface PatchResult {
  changed: boolean;
  body: string;
}

export function patchDurationBody(rawBody: string, selectedDuration: number): PatchResult {
  if (typeof rawBody !== 'string' || !rawBody.trim()) return { changed: false, body: rawBody };
  if (selectedDuration !== TARGET_DURATION) return { changed: false, body: rawBody };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { changed: false, body: rawBody };
  }

  const ability = payload?.chat_ability as Record<string, unknown> | undefined;
  if (!ability || Number(ability.ability_type) !== 17) return { changed: false, body: rawBody };

  const param = parseAbilityParam(ability.ability_param);
  param.model = TARGET_MODEL;
  param.duration = TARGET_DURATION;
  ability.ability_param = JSON.stringify(param);
  return { changed: true, body: JSON.stringify(payload) };
}

// ==================== fetch 重试 ====================

export async function fetchWithRetry(
  url: string,
  maxRetries: number = DEFAULTS.RETRY_MAX
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return resp;
      if (i === maxRetries - 1) throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = Math.pow(2, i) * DEFAULTS.RETRY_DELAY_BASE;
      console.log(`[AI去水印] 重试 ${i + 1}/${maxRetries}，等待 ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('unreachable');
}

// ============================================================
// AI去水印 - 核心函数单测
// ============================================================
const utils = require('../lib/utils');

describe('formatFilename', () => {
  const fixedNow = new Date('2026-07-01T12:30:45Z');

  test('默认模板生成正确文件名（含归档目录）', () => {
    const result = utils.formatFilename({ site: 'doubao', ext: 'mp4', _now: fixedNow, idx: 1 });
    expect(result).toMatch(/^AI去水印\/doubao\/20260701\/doubao_20260701_01\.mp4$/);
  });

  test('带标题的模板', () => {
    const result = utils.formatFilename(
      { site: 'dreamina', title: '可爱猫咪', ext: 'mp4', _now: fixedNow, idx: 3 },
      '{site}_{title}_{date}_{idx}.{ext}'
    );
    expect(result).toMatch(/^AI去水印\/dreamina\/20260701\/dreamina_可爱猫咪_20260701_03\.mp4$/);
  });

  test('特殊字符被替换为下划线', () => {
    const result = utils.formatFilename(
      { site: 'test', title: 'a/b:c*d?', ext: 'png', _now: fixedNow, idx: 1 },
      '{site}_{title}.{ext}'
    );
    // 只检查文件名部分（最后一段），目录路径中的 / 是正常的
    const filename = result.split('/').pop();
    expect(filename).not.toMatch(/[/:*?]/);
    expect(filename).toMatch(/^test_a_b_c_d\.png$/);
  });

  test('空标题不产生连续下划线', () => {
    const result = utils.formatFilename({ site: 'test', title: '', ext: 'mp4', _now: fixedNow, idx: 1 });
    expect(result).not.toMatch(/__/);
  });

  test('自定义模板变量替换', () => {
    const result = utils.formatFilename(
      { site: 'xyq', title: 'video', id: 'v123', ext: 'mp4', _now: fixedNow, idx: 5 },
      '{id}_{site}.{ext}'
    );
    expect(result).toBe('AI去水印/xyq/20260701/v123_xyq.mp4');
  });

  test('默认模板常量正确', () => {
    expect(utils.DEFAULT_FILENAME_TEMPLATE).toBe('{site}_{date}_{idx}.{ext}');
  });

  test('自定义归档前缀', () => {
    const result = utils.formatFilename({ site: 'klingai', ext: 'mp4', _now: fixedNow, idx: 1, archivePrefix: '我的下载' });
    expect(result).toMatch(/^我的下载\/klingai\/20260701\/klingai_20260701_01\.mp4$/);
  });
});

describe('createDedupChecker', () => {
  test('首次下载不重复', () => {
    const checker = utils.createDedupChecker(60000, 200);
    expect(checker.isDuplicateDownload('http://example.com/a.mp4', 1000)).toBe(false);
  });

  test('TTL 内重复下载被拦截', () => {
    const checker = utils.createDedupChecker(60000, 200);
    checker.isDuplicateDownload('http://example.com/a.mp4', 1000);
    expect(checker.isDuplicateDownload('http://example.com/a.mp4', 5000)).toBe(true);
  });

  test('TTL 过期后不重复', () => {
    const checker = utils.createDedupChecker(1000, 200);
    checker.isDuplicateDownload('http://example.com/a.mp4', 1000);
    expect(checker.isDuplicateDownload('http://example.com/a.mp4', 3000)).toBe(false);
  });

  test('不同 URL 不互相影响', () => {
    const checker = utils.createDedupChecker(60000, 200);
    checker.isDuplicateDownload('http://example.com/a.mp4', 1000);
    expect(checker.isDuplicateDownload('http://example.com/b.mp4', 1000)).toBe(false);
  });

  test('空 URL 返回 false', () => {
    const checker = utils.createDedupChecker(60000, 200);
    expect(checker.isDuplicateDownload('', 1000)).toBe(false);
    expect(checker.isDuplicateDownload(null, 1000)).toBe(false);
    expect(checker.isDuplicateDownload(undefined, 1000)).toBe(false);
  });

  test('getSize 和 clear 正常工作', () => {
    const checker = utils.createDedupChecker(60000, 200);
    checker.isDuplicateDownload('http://a.com', 1000);
    checker.isDuplicateDownload('http://b.com', 1000);
    expect(checker.getSize()).toBe(2);
    checker.clear();
    expect(checker.getSize()).toBe(0);
  });
});

describe('findAllKeysInJson', () => {
  test('找到顶层 key', () => {
    const result = utils.findAllKeysInJson({ creations: [1, 2] }, 'creations');
    expect(result).toEqual([[1, 2]]);
  });

  test('找到嵌套 key', () => {
    const data = { a: { creations: 'found' }, b: { c: { creations: 'deep' } } };
    const result = utils.findAllKeysInJson(data, 'creations');
    expect(result).toEqual(['found', 'deep']);
  });

  test('数组中递归搜索', () => {
    const data = [{ creations: 1 }, { creations: 2 }];
    const result = utils.findAllKeysInJson(data, 'creations');
    expect(result).toEqual([1, 2]);
  });

  test('找不到返回空数组', () => {
    const result = utils.findAllKeysInJson({ a: 1 }, 'missing');
    expect(result).toEqual([]);
  });

  test('null/undefined 输入返回空数组', () => {
    expect(utils.findAllKeysInJson(null, 'key')).toEqual([]);
    expect(utils.findAllKeysInJson(undefined, 'key')).toEqual([]);
  });
});

describe('extractImageUrlsFromCreations', () => {
  test('从 creations 提取原始图片 URL', () => {
    // 实际 API 结构：creations 包含一组 item
    const json = {
      creations: [
        { image: { image_ori_raw: { url: 'http://img.example.com/1.png' } } },
        { image: { image_ori_raw: { url: 'http://img.example.com/2.png' } } }
      ]
    };
    const urls = utils.extractImageUrlsFromCreations(json);
    expect(urls).toEqual(['http://img.example.com/1.png', 'http://img.example.com/2.png']);
  });

  test('无 creations 返回空数组', () => {
    expect(utils.extractImageUrlsFromCreations({ data: 123 })).toEqual([]);
  });

  test('无 image_ori_raw 的条目被跳过', () => {
    const json = {
      creations: [
        { image: { image_ori: { url: 'watermarked' } } },
        { image: { image_ori_raw: { url: 'http://raw.png' } } }
      ]
    };
    const urls = utils.extractImageUrlsFromCreations(json);
    expect(urls).toEqual(['http://raw.png']);
  });

  test('嵌套结构中找到 creations', () => {
    const json = {
      data: {
        creations: [
          { image: { image_ori_raw: { url: 'http://nested.png' } } }
        ]
      }
    };
    const urls = utils.extractImageUrlsFromCreations(json);
    expect(urls).toEqual(['http://nested.png']);
  });
});

describe('patchDurationBody', () => {
  test('非 15s 选择不改写', () => {
    const body = JSON.stringify({ chat_ability: { ability_type: 17, ability_param: '{"model":"x","duration":5}' } });
    const result = utils.patchDurationBody(body, 5);
    expect(result.changed).toBe(false);
  });

  test('15s 选择改写成功', () => {
    const body = JSON.stringify({
      chat_ability: { ability_type: 17, ability_param: '{"model":"x","duration":5}' }
    });
    const result = utils.patchDurationBody(body, 15);
    expect(result.changed).toBe(true);
    const parsed = JSON.parse(result.body);
    const param = JSON.parse(parsed.chat_ability.ability_param);
    expect(param.model).toBe('seedance_v2.0');
    expect(param.duration).toBe(15);
  });

  test('非 ability_type 17 不改写', () => {
    const body = JSON.stringify({ chat_ability: { ability_type: 1, ability_param: '{}' } });
    const result = utils.patchDurationBody(body, 15);
    expect(result.changed).toBe(false);
  });

  test('空字符串不改写', () => {
    expect(utils.patchDurationBody('', 15).changed).toBe(false);
    expect(utils.patchDurationBody('  ', 15).changed).toBe(false);
  });

  test('无效 JSON 不改写', () => {
    expect(utils.patchDurationBody('not json', 15).changed).toBe(false);
  });
});

describe('parseAbilityParam', () => {
  test('解析 JSON 字符串', () => {
    const result = utils.parseAbilityParam('{"model":"x","duration":5}');
    expect(result).toEqual({ model: 'x', duration: 5 });
  });

  test('对象直接返回副本', () => {
    const obj = { model: 'x' };
    const result = utils.parseAbilityParam(obj);
    expect(result).toEqual(obj);
    expect(result).not.toBe(obj); // 副本，不是引用
  });

  test('空字符串返回空对象', () => {
    expect(utils.parseAbilityParam('')).toEqual({});
    expect(utils.parseAbilityParam('  ')).toEqual({});
  });

  test('无效 JSON 返回空对象', () => {
    expect(utils.parseAbilityParam('not json')).toEqual({});
  });
});

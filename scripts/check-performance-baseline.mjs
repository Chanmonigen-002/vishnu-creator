import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const assetsDir = resolve('apps/web/dist/assets');
const performanceBaselinePath = resolve(
  'docs/performance/2026-09-04-scheduled-task-100-baseline.json'
);
const dubEngineBaselinePath = resolve(
  'docs/performance/2026-10-29-dub-engine-tier1-baseline.json'
);
const dubEngineResultsPath = resolve('jobs/benchmark_results.json');
const performanceResultsDir = resolve('test-results/performance');
const expectedPerformanceProjects = [
  'chromium-desktop',
  'chromium-mobile'
];
const performanceResultsRequired =
  process.env.VISHNUCREATOR_PERFORMANCE_RESULTS_REQUIRED === '1';
let failed = false;

const assetMeasurements = measureAssets();
const performance = measureScheduledTaskPerformance();
const dubTiming = measureDubEngineTiming();

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  assetsDir,
  assetMeasurements,
  performance,
  dubTiming
}, null, 2));

if (failed) process.exitCode = 1;

function measureAssets() {
  const files = readdirSync(assetsDir).map(name => ({
    name,
    path: join(assetsDir, name),
    bytes: statSync(join(assetsDir, name)).size
  }));
  const targets = [
    {
      label: 'Web 主入口 JavaScript',
      pattern: /^index-[^.]+\.js$/,
      maxBytes: 750_000,
      maxGzipBytes: 215_000
    },
    {
      label: 'FilesPage JavaScript',
      pattern: /^FilesPage-[^.]+\.js$/,
      maxBytes: 600_000,
      maxGzipBytes: 220_000
    },
    {
      label: 'SettingsPage JavaScript',
      pattern: /^SettingsPage-[^.]+\.js$/,
      maxBytes: 100_000,
      maxGzipBytes: 27_000
    },
    {
      label: 'AI services settings JavaScript',
      pattern: /^CreatorServicesSettingsView-[^.]+\.js$/,
      maxBytes: 85_000,
      maxGzipBytes: 25_000
    },
    {
      label: 'Web 主样式',
      pattern: /^index-[^.]+\.css$/,
      maxBytes: 165_000,
      maxGzipBytes: 28_000
    }
  ];

  return targets.map(target => {
    const asset = files.find(file => target.pattern.test(file.name));
    if (asset === undefined) {
      failed = true;
      return { label: target.label, error: '未找到构建产物' };
    }
    const gzipBytes = gzipSync(readFileSync(asset.path)).byteLength;
    const withinBudget =
      asset.bytes <= target.maxBytes
      && gzipBytes <= target.maxGzipBytes;
    if (!withinBudget) failed = true;
    return {
      label: target.label,
      file: basename(asset.path),
      bytes: asset.bytes,
      gzipBytes,
      maxBytes: target.maxBytes,
      maxGzipBytes: target.maxGzipBytes,
      withinBudget
    };
  });
}

function measureScheduledTaskPerformance() {
  const baseline = readJson(performanceBaselinePath);
  if (!isRecord(baseline)) {
    failed = true;
    return {
      baselinePath: performanceBaselinePath,
      error: '性能基线必须是 JSON 对象'
    };
  }
  if (
    typeof baseline.scenario !== 'string'
    || !isPositiveInteger(baseline.seedCount)
    || !isRecord(baseline.thresholds)
    || !isRecord(baseline.baselines)
  ) {
    failed = true;
    return {
      baselinePath: performanceBaselinePath,
      error: '性能基线缺少 scenario、seedCount、thresholds 或 baselines'
    };
  }

  const projects = Object.keys(baseline.baselines);
  const missingProjects = expectedPerformanceProjects.filter(
    project => !projects.includes(project)
  );
  const unexpectedProjects = projects.filter(
    project => !expectedPerformanceProjects.includes(project)
  );
  if (missingProjects.length > 0 || unexpectedProjects.length > 0) {
    failed = true;
  }
  const committed = projects.map(project => evaluateProject({
    source: 'committed-baseline',
    project,
    payload: baseline.baselines[project],
    thresholds: baseline.thresholds
  }));
  const current = projects.flatMap(project => {
    const resultPath = join(performanceResultsDir, `${project}.json`);
    if (!existsSync(resultPath)) {
      if (!performanceResultsRequired) return [];
      failed = true;
      return [{
        source: 'current-run',
        project,
        resultPath,
        error: '缺少本次性能测量结果'
      }];
    }
    const result = readJson(resultPath);
    if (
      !isRecord(result)
      || result.scenario !== baseline.scenario
      || result.seedCount !== baseline.seedCount
      || result.project !== project
      || !isRecord(result.measurements)
    ) {
      failed = true;
      return [{
        source: 'current-run',
        project,
        resultPath,
        error: '本次性能测量结果与基线场景不匹配'
      }];
    }
    return [evaluateProject({
      source: 'current-run',
      project,
      resultPath,
      payload: result,
      thresholds: baseline.thresholds
    })];
  });

  return {
    baselinePath: performanceBaselinePath,
    resultsDir: performanceResultsDir,
    resultsRequired: performanceResultsRequired,
    scenario: baseline.scenario,
    seedCount: baseline.seedCount,
    projectValidation: {
      expected: expectedPerformanceProjects,
      actual: projects,
      missing: missingProjects,
      unexpected: unexpectedProjects,
      valid: missingProjects.length === 0 && unexpectedProjects.length === 0
    },
    thresholds: baseline.thresholds,
    committed,
    current
  };
}

function evaluateProject(input) {
  const measurements = isRecord(input.payload)
    && isRecord(input.payload.measurements)
    ? input.payload.measurements
    : undefined;
  if (measurements === undefined) {
    failed = true;
    return {
      source: input.source,
      project: input.project,
      ...(input.resultPath === undefined ? {} : { resultPath: input.resultPath }),
      error: '缺少 measurements'
    };
  }

  const budgets = [
    ['initialRuntimeRequests', 'maxRuntimeRequestsPerLoad', '首屏 runtime 请求'],
    ['refreshRuntimeRequests', 'maxRuntimeRequestsPerLoad', '刷新 runtime 请求'],
    ['initialThreadListRequests', 'maxThreadListRequestsPerLoad', '首屏 Thread 列表请求'],
    ['refreshThreadListRequests', 'maxThreadListRequestsPerLoad', '刷新 Thread 列表请求'],
    ['scheduleViewRequests', 'maxScheduleViewRequests', '已安排页面请求'],
    ['searchViewRequests', 'maxSearchViewRequests', '搜索页面请求'],
    [
      'taskHistoryRequestsBeforeSelection',
      'maxTaskHistoryRequestsBeforeSelection',
      '选中任务前的任务历史请求'
    ],
    [
      'taskHistoryRequestsAfterSelection',
      'maxTaskHistoryRequestsAfterSelection',
      '选中任务后的任务历史请求'
    ],
    ['maxDomNodes', 'maxDomNodes', 'DOM 节点峰值'],
    ['longTaskCount', 'maxLongTaskCount', 'Long Task 数量'],
    ['maxLongTaskDurationMs', 'maxLongTaskDurationMs', '单次 Long Task'],
    ['totalLongTaskDurationMs', 'maxLongTaskTotalMs', 'Long Task 累计'],
    ['taskOpenLatencyMs', 'maxTaskOpenLatencyMs', '任务打开延迟']
  ];
  const checks = budgets.map(([measurementKey, thresholdKey, label]) => {
    const value = measurements[measurementKey];
    const maximum = input.thresholds[thresholdKey];
    const withinBudget =
      isNonNegativeNumber(value)
      && isNonNegativeNumber(maximum)
      && value <= maximum;
    if (!withinBudget) failed = true;
    return {
      label,
      measurementKey,
      value,
      maximum,
      withinBudget
    };
  });

  return {
    source: input.source,
    project: input.project,
    ...(input.resultPath === undefined ? {} : { resultPath: input.resultPath }),
    checks
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    failed = true;
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function measureDubEngineTiming() {
  const baseline = readJson(dubEngineBaselinePath);
  if (!isRecord(baseline)) {
    failed = true;
    return {
      baselinePath: dubEngineBaselinePath,
      error: 'Dub Engine 性能基线必须是 JSON 对象'
    };
  }

  const resultSource = existsSync(dubEngineResultsPath)
    ? readJson(dubEngineResultsPath)
    : baseline.measurements;

  if (!isRecord(resultSource)) {
    failed = true;
    return {
      baselinePath: dubEngineBaselinePath,
      error: '无法读取 Dub Engine 性能测试结果'
    };
  }

  const checks = [
    {
      label: 'ASR 识别耗时 (秒)',
      key: 'asr_time',
      value: resultSource.asr_time,
      maximum: baseline.thresholds.maxAsrTimeSeconds,
      withinBudget: isNonNegativeNumber(resultSource.asr_time) && resultSource.asr_time <= baseline.thresholds.maxAsrTimeSeconds
    },
    {
      label: 'TTS 语音合成耗时 (秒)',
      key: 'tts_time',
      value: resultSource.tts_time,
      maximum: baseline.thresholds.maxTtsTimeSeconds,
      withinBudget: isNonNegativeNumber(resultSource.tts_time) && resultSource.tts_time <= baseline.thresholds.maxTtsTimeSeconds
    },
    {
      label: '人声伴奏分离耗时 (秒)',
      key: 'separation_time',
      value: resultSource.separation_time,
      maximum: baseline.thresholds.maxSeparationTimeSeconds,
      withinBudget: isNonNegativeNumber(resultSource.separation_time) && resultSource.separation_time <= baseline.thresholds.maxSeparationTimeSeconds
    },
    {
      label: '基准总耗时 (秒)',
      key: 'total_time',
      value: resultSource.total_time,
      maximum: baseline.thresholds.maxTotalTimeSeconds,
      withinBudget: isNonNegativeNumber(resultSource.total_time) && resultSource.total_time <= baseline.thresholds.maxTotalTimeSeconds
    }
  ];

  for (const check of checks) {
    if (!check.withinBudget) failed = true;
  }

  return {
    baselinePath: dubEngineBaselinePath,
    hardwareTier: baseline.hardwareTier,
    hardwareProfile: baseline.hardwareProfile,
    checks
  };
}

import { expect, it, vi } from 'vitest';
import { createDefaultCustomStatusConfig, type MatrixLottery } from './matrix-custom-status';
import { createMatrixCustomStatusRecomputeService } from './matrix-custom-status-recompute';

const lotteries: MatrixLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];

function source(lottery: MatrixLottery, drawPeriod = '114000123', analysisVersion = 'v1') {
  return {
    analysisVersion,
    drawPeriod,
    explore: { lottery, drawPeriod, items: [], validationById: {} },
    tianyan: { lottery, drawPeriod, items: [] },
  };
}

it.each(lotteries)('batch recomputes %s from one shared source read', async (lottery) => {
  const configsA = [createDefaultCustomStatusConfig(lottery, 'ACTIVE')];
  const configsB = [createDefaultCustomStatusConfig(lottery, 'FOCUS')];
  const readStatusSources = vi.fn(async () => source(lottery));
  const save = vi.fn(async () => undefined);
  const service = createMatrixCustomStatusRecomputeService({
    readStatusSources,
    listConfigs: async () => [],
    listConfigsByLottery: async () => [
      { memberId: 'member-a', configs: configsA },
      { memberId: 'member-b', configs: configsB },
    ],
    resultStore: { save, reset: vi.fn(async () => undefined) },
  });

  await expect(service.recomputeLottery(lottery)).resolves.toMatchObject({
    lottery, updated: 2, drawPeriod: '114000123', analysisVersion: 'v1',
  });
  expect(readStatusSources).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls.map((call) => call[0])).toEqual(['member-a', 'member-b']);
});

it('writes a newer draw/version into each member cache on the next batch', async () => {
  const lottery: MatrixLottery = '大樂透';
  const configs = [createDefaultCustomStatusConfig(lottery, 'ACTIVE')];
  const sources = [
    source(lottery, '114000123', 'v1'),
    source(lottery, '114000124', 'v2'),
  ];
  const save = vi.fn(async () => undefined);
  const service = createMatrixCustomStatusRecomputeService({
    readStatusSources: vi.fn(async () => sources.shift() ?? null),
    listConfigs: async () => configs,
    listConfigsByLottery: async () => [{ memberId: 'member-a', configs }],
    resultStore: { save, reset: vi.fn(async () => undefined) },
  });

  await service.recomputeLottery(lottery);
  await service.recomputeLottery(lottery);

  expect(save.mock.calls[0]?.[2]).toMatchObject({ drawPeriod: '114000123', analysisVersion: 'v1' });
  expect(save.mock.calls[1]?.[2]).toMatchObject({ drawPeriod: '114000124', analysisVersion: 'v2' });
});

it('does not read large status sources when a lottery has no custom members', async () => {
  const readStatusSources = vi.fn(async () => source('天天樂'));
  const save = vi.fn(async () => undefined);
  const service = createMatrixCustomStatusRecomputeService({
    readStatusSources,
    listConfigs: async () => [],
    listConfigsByLottery: async () => [],
    resultStore: { save, reset: vi.fn(async () => undefined) },
  });

  await expect(service.recomputeLottery('天天樂')).resolves.toEqual({ lottery: '天天樂', updated: 0 });
  expect(readStatusSources).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it('removes the member cache when the last custom config for that lottery is reset', async () => {
  const readStatusSources = vi.fn(async () => source('今彩539'));
  const reset = vi.fn(async () => undefined);
  const service = createMatrixCustomStatusRecomputeService({
    readStatusSources,
    listConfigs: async () => [],
    listConfigsByLottery: async () => [],
    resultStore: { save: vi.fn(async () => undefined), reset },
  });

  await expect(service.recomputeMember('member-a', '今彩539')).resolves.toMatchObject({
    updated: false, removed: true,
  });
  expect(reset).toHaveBeenCalledWith('member-a', '今彩539');
  expect(readStatusSources).not.toHaveBeenCalled();
});

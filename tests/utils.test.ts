import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../src/errors';
import { addActivityLog, cascadeUpdate, getTaskOrThrow, healParentRollups, recalculateProgress, updateParentStatus } from '../src/actions/utils';
import { createSampleData } from './helpers';

describe('action utils', () => {
  it('looks up tasks and throws for missing ids', () => {
    const data = createSampleData();
    expect(getTaskOrThrow(data, 'M1').id).toBe('M1');
    expect(() => getTaskOrThrow(data, 'missing')).toThrow(NotFoundError);
  });

  it('adds activity log entries and caps history', () => {
    const data = createSampleData();
    // Exercise the branch that initializes an absent log.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data.tasks.I1 as any).activityLog = undefined;
    addActivityLog(data, 'I1', 'first', 'agent');
    for (let i = 0; i < 25; i += 1) {
      addActivityLog(data, 'I1', `note ${i}`, 'agent');
    }
    expect(data.tasks.I1.activityLog).toHaveLength(20);
    expect(data.tasks.I1.activityLog[0]?.note).toBe('note 24');
  });

  it('recalculates progress from children', () => {
    const data = createSampleData();
    data.tasks.M1.children = ['I1'];
    data.tasks.I1.progress = 80;
    recalculateProgress(data, 'M1');
    expect(data.tasks.M1.progress).toBe(80);

    data.tasks.M1.children = [];
    recalculateProgress(data, 'M1');
    expect(data.tasks.M1.progress).toBe(80);
  });

  it('updates parent status and cascades progress upward', () => {
    const data = createSampleData();
    data.tasks.I1.status = 'done';
    data.tasks.I1.progress = 100;

    updateParentStatus(data, 'I1');
    expect(data.tasks.M1.status).toBe('done');
    expect(data.tasks.M1.progress).toBe(100);

    data.tasks.M1.status = 'ongoing';
    data.tasks.M1.progress = 10;
    data.tasks.ROOT.status = 'not_started';
    data.tasks.ROOT.progress = 0;

    cascadeUpdate(data, 'I1');
    expect(data.tasks.M1.progress).toBe(100);
    expect(data.tasks.ROOT.progress).toBe(100);
    expect(data.tasks.ROOT.status).toBe('done');
  });

  it('no-ops when parents or children are missing', () => {
    const data = createSampleData();
    delete data.tasks.I1;

    expect(() => updateParentStatus(data, 'ROOT')).not.toThrow();
    expect(() => updateParentStatus(data, 'M1')).not.toThrow();
    expect(() => cascadeUpdate(data, 'ROOT')).not.toThrow();
    expect(() => recalculateProgress(data, 'ROOT')).not.toThrow();
  });

  describe('healParentRollups', () => {
    it('recomputes parent progress when all children are done but parent is stale', () => {
      const data = createSampleData();
      // I1 is done and 100% — M1 should be 100 / status=done, but is stale (50 / ongoing).
      data.tasks.I1.status = 'done';
      data.tasks.I1.progress = 100;
      data.tasks.M1.status = 'ongoing';
      data.tasks.M1.progress = 50;
      // ROOT is also stale (50 / ongoing) but has only 2 children: M1 (now 100) + I1 (100) → 100.
      data.tasks.ROOT.status = 'ongoing';
      data.tasks.ROOT.progress = 50;

      const report = healParentRollups(data);

      expect(data.tasks.M1.progress).toBe(100);
      expect(data.tasks.M1.status).toBe('done');
      expect(data.tasks.ROOT.progress).toBe(100);
      expect(data.tasks.ROOT.status).toBe('done');
      expect(report.fixed).toEqual(expect.arrayContaining(['M1', 'ROOT']));
    });

    it('forces progress=100 when status=done but progress is wrong', () => {
      const data = createSampleData();
      data.tasks.M1.status = 'done';
      data.tasks.M1.progress = 75; // stale: done but not 100
      data.tasks.I1.status = 'done';
      data.tasks.I1.progress = 100;
      // No M1 children progress mismatch to flag; but the status/progress inconsistency is.

      const report = healParentRollups(data);

      expect(data.tasks.M1.progress).toBe(100);
      expect(report.fixed).toContain('M1');
    });

    it('recomputes unweighted mean of children regardless of old parent value', () => {
      const data = createSampleData();
      data.tasks.I1.status = 'ongoing';
      data.tasks.I1.progress = 80;
      data.tasks.M1.status = 'ongoing';
      data.tasks.M1.progress = 0; // stale — should become 80

      healParentRollups(data);

      expect(data.tasks.M1.progress).toBe(80);
    });

    it('no-ops on already-correct data and reports nothing fixed', () => {
      const data = createSampleData();
      // sample data is already internally consistent (M1=50, I1=50, ROOT=50).
      const report = healParentRollups(data);

      expect(report.fixed).toEqual([]);
    });

    it('skips nodes with no children and does not modify them', () => {
      const data = createSampleData();
      const before = JSON.stringify(data.tasks.I1);

      healParentRollups(data);

      expect(JSON.stringify(data.tasks.I1)).toBe(before);
    });

    it('flips not_started parent to ongoing when any child is ongoing', () => {
      const data = createSampleData();
      data.tasks.I1.status = 'ongoing';
      data.tasks.I1.progress = 50;
      data.tasks.M1.status = 'not_started';
      data.tasks.M1.progress = 0;

      healParentRollups(data);

      expect(data.tasks.M1.status).toBe('ongoing');
      expect(data.tasks.M1.progress).toBe(50);
    });
  });
});

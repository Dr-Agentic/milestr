import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../src/errors';
import { addActivityLog, cascadeUpdate, getTaskOrThrow, recalculateProgress, updateParentStatus } from '../src/actions/utils';
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
});

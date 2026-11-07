import { describe, expect, it } from 'vitest';
import { PAGES } from '@/modules/studio/panels';
import { createTutorialStore } from './Tutorial';
import { GROUPS, TOPICS, topicFor } from './topics';

describe('the tutorial', () => {
  it('has a short lesson, with steps and an example, for every page of a project', () => {
    const covered = new Set(TOPICS.map((t) => t.page));
    for (const page of PAGES) expect(covered.has(page.to === '.' ? '' : page.to), `no lesson for the ${page.label} page`).toBe(true);
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    for (const topic of TOPICS) {
      expect(GROUPS).toContain(topic.group);
      expect(topic.steps.length, topic.id).toBeGreaterThanOrEqual(3);
      expect(topic.steps.length, topic.id).toBeLessThanOrEqual(5);
      expect(topic.what.length, topic.id).toBeLessThanOrEqual(190);
      expect(topic.example.trim().length, topic.id).toBeGreaterThan(30);
      expect(topic.page !== undefined || Boolean(topic.where), topic.id).toBe(true);
    }
  });

  it('opens on the lesson for the page in view', () => {
    expect(topicFor('/').id).toBe('library');
    expect(topicFor('/cloud').id).toBe('sync');
    expect(topicFor('/join').id).toBe('team');
    expect(topicFor('/project/abc').id).toBe('overview');
    expect(topicFor('/project/abc/codex/entry-1').id).toBe('codex');
    expect(topicFor('/project/abc/manuscript/ch-2').id).toBe('manuscript');
    expect(topicFor('/project/abc/read').id).toBe('read');
    expect(topicFor('/project/abc/modules/mystery').id).toBe('modules');
    expect(topicFor('/project/abc/somewhere-new').id).toBe('overview');
  });

  it('shows its button until switched off, and remembers the choice on the device', () => {
    const stored = new Map<string, string>();
    const storage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) };
    const store = createTutorialStore(storage);
    let told = 0;
    store.subscribe(() => told++);
    expect(store.shown()).toBe(true);
    store.setShown(false);
    expect([store.shown(), told, stored.get('novel-builder:tutorial')]).toEqual([false, 1, 'off']);
    expect(createTutorialStore(storage).shown()).toBe(false);
    store.setShown(true);
    expect(createTutorialStore(storage).shown()).toBe(true);
    expect(createTutorialStore(null).shown()).toBe(true);
  });
});

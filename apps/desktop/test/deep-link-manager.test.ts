import { describe, expect, it } from 'vitest';
import { deepLinkToRoute } from '../src/main/deep-link-manager.js';

describe('Desktop deep-link validation', () => {
  it('returns to the account page with an order ID but never trusts payment claims', () => {
    expect(deepLinkToRoute('vishnucreator://billing/return')).toBe('#/account?billing=return');
    expect(deepLinkToRoute('vishnucreator://billing/return?orderId=order-1')).toBe('#/account?billing=return&orderId=order-1');
    for (const value of ['vishnucreator://billing/return?orderId=', 'vishnucreator://billing/return?orderId=order%2F1', 'vishnucreator://billing/return?paid=true', 'vishnucreator://billing/return#paid', 'vishnucreator://billing/return/extra']) expect(deepLinkToRoute(value), value).toBeUndefined();
  });
  it('opens the account page for the fixed authorization callback without accepting credentials', () => {
    expect(deepLinkToRoute('vishnucreator://auth/complete')).toBe('#/account?login=complete');
    for (const value of [
      'vishnucreator://auth/complete?token=secret',
      'vishnucreator://auth/complete#secret',
      'vishnucreator://user@auth/complete',
      'vishnucreator://auth:80/complete',
      'vishnucreator://auth/complete/extra'
    ]) expect(deepLinkToRoute(value), value).toBeUndefined();
  });
  it('rejects any malformed path or query encoding as one invalid link', () => {
    for (const value of [
      'vishnucreator://thread/%',
      'vishnucreator://thread/%E0%A4%A',
      'vishnucreator://thread/ok?runId=%',
      'vishnucreator://thread/ok?unused=%E0%A4%A',
      'vishnucreator://thread/%00hidden',
      'vishnucreator://thread/%EF%BF%BD'
    ]) {
      expect(deepLinkToRoute(value), value).toBeUndefined();
    }
  });

  it('accepts valid Unicode, spaces, and encoded slashes', () => {
    expect(deepLinkToRoute(
      'vishnucreator://thread/thread%2F%E4%B8%AD%E6%96%87?runId=run+one'
    )).toBe(
      '#/thread/thread%2F%E4%B8%AD%E6%96%87?runId=run+one'
    );
  });

  it('rejects empty and overlong UTF-8 identifiers', () => {
    expect(deepLinkToRoute('vishnucreator://thread/ok?runId=')).toBeUndefined();
    expect(deepLinkToRoute(
      `vishnucreator://thread/${encodeURIComponent('中'.repeat(200))}`
    )).toBeUndefined();
  });
});

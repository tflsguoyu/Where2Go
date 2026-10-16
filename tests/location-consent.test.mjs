import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationConsent } from '../location-consent.js';

function fixture({ permission = 'prompt', choice = '', permissionsSupported = true } = {}) {
  const calls = { requests: 0, prompts: 0, hidden: 0, points: [], failures: [] };
  let success, failure;
  const nav = { geolocation: { getCurrentPosition(ok, fail) { calls.requests++; success = ok; failure = fail; } } };
  if (permissionsSupported) nav.permissions = { query: async () => ({ state: permission }) };
  const consent = createLocationConsent({ navigator: nav, readChoice: () => choice, writeChoice: value => { choice = value; },
    showPrompt: () => calls.prompts++, hidePrompt: () => calls.hidden++, onStart() {},
    onPosition: point => calls.points.push(point), onFailure: error => calls.failures.push(error) });
  return { consent, calls, nav, choice: () => choice, success: point => success({ coords: point }), failure: error => failure(error) };
}

test('first visit asks, and does not read location before consent', async () => {
  const f = fixture(); await f.consent.start();
  assert.equal(f.calls.prompts, 1); assert.equal(f.calls.requests, 0); assert.deepEqual(f.calls.points, []);
  f.consent.request(); assert.equal(f.calls.requests, 1);
  f.success({ latitude: 40.62, longitude: -74.49 });
  assert.deepEqual(f.calls.points, [{ lat: 40.62, lng: -74.49 }]); assert.equal(f.choice(), 'allowed');
});
test('declining persists default without triggering native location', async () => {
  const f = fixture(); await f.consent.start(); f.consent.decline(); await f.consent.start();
  assert.equal(f.choice(), 'declined'); assert.equal(f.calls.requests, 0); assert.equal(f.calls.prompts, 1);
});
test('previous browser grant locates automatically', async () => {
  const f = fixture({ permission: 'granted' }); await f.consent.start();
  assert.equal(f.calls.requests, 1); assert.equal(f.calls.prompts, 0);
});
test('native denial keeps default and suppresses repeated prompting', async () => {
  const f = fixture(); f.consent.request(); f.failure({ code: 1 }); await f.consent.start();
  assert.deepEqual(f.calls.points, []); assert.equal(f.choice(), 'declined'); assert.equal(f.calls.requests, 1);
});
test('browser denial or prior app decline never starts automatic location', async () => {
  for (const options of [{ permission: 'denied' }, { permission: 'granted', choice: 'declined' }]) {
    const f = fixture(options); await f.consent.start(); assert.equal(f.calls.requests, 0); assert.equal(f.calls.prompts, 0);
  }
});
test('unsupported permission query still allows consent flow and returning grants', async () => {
  const first = fixture({ permissionsSupported: false }); await first.consent.start(); assert.equal(first.calls.prompts, 1);
  const returning = fixture({ permissionsSupported: false, choice: 'allowed' }); await returning.consent.start(); assert.equal(returning.calls.requests, 1);
});
test('timeout, invalid coordinates and unavailable GPS cannot change default', () => {
  for (const code of [2, 3]) {
    const f = fixture(); f.consent.request(); f.failure({ code }); assert.deepEqual(f.calls.points, []); assert.equal(f.choice(), '');
  }
  const f = fixture(); f.consent.request(); f.success({ latitude: NaN, longitude: -74 }); assert.deepEqual(f.calls.points, []);
});
test('late GPS response cannot override a newer manual ZIP search', () => {
  const f = fixture(); f.consent.request(); f.consent.cancel(); f.success({ latitude: 40.8, longitude: -74 });
  assert.deepEqual(f.calls.points, []); assert.equal(f.choice(), '');
});
test('manual retry works after decline; repeated clicks do not duplicate requests', () => {
  const f = fixture({ choice: 'declined' }); f.consent.request(); f.consent.request(); assert.equal(f.calls.requests, 1);
  f.success({ latitude: 40.8, longitude: -74 }); assert.equal(f.choice(), 'allowed');
});
test('insecure or unsupported geolocation leaves default in place', async () => {
  const f = fixture(); delete f.nav.geolocation; await f.consent.start();
  assert.equal(f.calls.prompts, 0); assert.equal(f.calls.requests, 0); assert.deepEqual(f.calls.points, []);
});

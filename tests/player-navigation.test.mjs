import test from 'node:test';
import assert from 'node:assert/strict';
import { prefersDuoNavigation, navigationPreference } from '../lib/playerNavigation.mjs';
const iPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)';
test('Duo proportions use the rail on either display and in either orientation', () => {
  for (const [width,height] of [[466,678],[626,890],[678,466],[890,626],[393,572]]) {
    assert.equal(prefersDuoNavigation({userAgent:iPhone,width,height}), true);
  }
});
test('standard iPhones, Android, iPad and desktop retain standard navigation', () => {
  for (const [width,height] of [[375,667],[390,844],[430,932],[932,430],[320,568]]) {
    assert.equal(prefersDuoNavigation({userAgent:iPhone,width,height}), false);
  }
  for (const userAgent of ['Android','iPad','Macintosh','']) {
    assert.equal(prefersDuoNavigation({userAgent,width:466,height:678}), false);
  }
});
test('missing screen data and invalid saved choices fall back safely', () => {
  assert.equal(prefersDuoNavigation(),false);
  assert.equal(prefersDuoNavigation({userAgent:iPhone,width:0,height:0}),false);
  assert.equal(navigationPreference('invalid'),'auto');
  assert.equal(navigationPreference(null),'auto');
  for (const value of ['auto','right','standard']) assert.equal(navigationPreference(value),value);
});

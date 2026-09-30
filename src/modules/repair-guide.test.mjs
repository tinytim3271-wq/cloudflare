import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepairGuide, repairDiagram, repairFamily, safeVideoUrl, stepText, youtubeSearchUrl } from './repair-guide.js';

test('jobs land on the matching procedure', () => {
  assert.equal(repairFamily('Front Brake Pad Replacement'), 'brakes');
  assert.equal(repairFamily('Brake Fluid Flush'), 'brake-flush');
  assert.equal(repairFamily('Replace water pump and thermostat'), 'cooling');
  assert.equal(repairFamily('Full Synthetic Oil Change'), 'oil');
  assert.equal(repairFamily('Serpentine Belt'), 'belt');
  assert.equal(repairFamily('Cabin Air Filter'), 'cabin-filter');
  assert.equal(repairFamily('No-Start Diagnostic'), 'nostart');
  assert.equal(repairFamily('V6 Tune-Up With Plugs and Coils'), 'ignition');
  assert.equal(repairFamily('Mystery noise'), 'general');
});

test('a guide has detailed steps, a diagram, and YouTube searches for the vehicle', () => {
  const guide = buildRepairGuide('2018 Ford F-150', 'Front brake pads and rotors');
  assert.equal(guide.kind, 'guide');
  assert.equal(guide.family, 'brakes');
  assert.ok(guide.steps.length >= 6);
  assert.ok(guide.steps.every(step => step.title && step.detail.length > 80 && step.watch));
  assert.match(repairDiagram(guide.diagram), /<svg/);
  assert.match(repairDiagram('missing'), /<svg/);
  assert.ok(guide.videos.length >= 2);
  assert.match(guide.videos[0].url, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
  const query = new URL(guide.videos[0].url).searchParams.get('search_query');
  assert.match(query, /2018 Ford F-150/);
  assert.match(query, /Front brake pads and rotors/);
  assert.equal(safeVideoUrl(guide.videos[0].url), guide.videos[0].url);
  assert.equal(safeVideoUrl('https://evil.example/watch'), '');
  assert.match(stepText(guide.steps[0]), /^Confirm the complaint/);
});

test('search links stay on the YouTube results page', () => {
  const url = youtubeSearchUrl('2017 GMC Sierra water pump');
  assert.equal(new URL(url).hostname, 'www.youtube.com');
  assert.equal(new URL(url).pathname, '/results');
});

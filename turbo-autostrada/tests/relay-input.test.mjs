import test from 'node:test';
import assert from 'node:assert/strict';
import { likeCount, userOf } from '../relay-input.js';

test('relay retains the complete delivered tap count, including batches above 500', () => {
  for (const count of [1, 500, 501, 12500, 1000001]) assert.equal(likeCount(count), count);
  assert.equal(likeCount('12500'), 12500);
  for (const count of [undefined, null, '', 0, -1, 2.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.equal(likeCount(count), 0);
});

test('relay keeps TikTok viewer photos across connector image shapes', () => {
  const url = 'https://p16-sign-va.tiktokcdn.com/avatar.jpeg';
  for (const photo of [
    { profilePicture: { url: [url] } }, { profilePicture: { url: url } },
    { avatarThumb: { urlList: [url] } }, { profilePicture: {}, avatarLarge: { urlList: [url] } },
    { profilePictureUrl: url }
  ]) assert.deepEqual(userOf({ uniqueId: 'viewer', nickname: 'Viewer', ...photo }), { id: 'viewer', name: 'Viewer', avatar: url });
  assert.equal(userOf(null).avatar, '');
});

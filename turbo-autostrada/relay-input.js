// Normalize connector input without truncating a delivered batch of taps.
// A missing/invalid count is not evidence of one tap.
export function likeCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

export function userOf(user = {}) {
  const u = user || {};
  const pictures = [u.profilePicture, u.avatarThumb, u.avatarMedium, u.avatarLarge, u.profilePictureUrl];
  const photo = pictures.flatMap(pic => typeof pic === 'string' ? [pic] : [pic?.urlList?.[0], Array.isArray(pic?.url) ? pic.url[0] : pic?.url])
    .find(url => typeof url === 'string' && url.startsWith('https://')) || '';
  return {
    id: String(u.uniqueId || u.userId || 'anonim'),
    name: String(u.nickname || u.uniqueId || 'anonim').slice(0, 24),
    avatar: photo
  };
}

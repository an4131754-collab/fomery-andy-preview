// Google Maps > Share or embed map > Embed a map, centered on downtown Taichung.
export const googleExploreEmbedUrl = 'https://www.google.com/maps/embed?pb=!1m10!1m8!1m3!1d29125.471413490483!2d120.67364819999999!3d24.1477358!3m2!1i1024!2i768!4f13.1!5e0!3m2!1szh-TW!2stw!4v1794151460460!5m2!1szh-TW!2stw';

export function mapSearchLinks(query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) {
    throw new RangeError('Enter a place or address within 200 characters');
  }
  const google = new URL('https://www.google.com/maps/search/');
  google.searchParams.set('api', '1');
  google.searchParams.set('query', query.trim());
  const apple = new URL('https://maps.apple.com/search');
  apple.searchParams.set('query', query.trim());
  return { google: google.href, apple: apple.href };
}

// Search and directions for real user-entered places.
export function mapsUrl(query, mode = 'search') {
  const text = String(query ?? '').trim();
  if (!text || text.length > 180) throw new Error('請輸入 1–180 字的地點或地址');
  const directions = mode === 'directions';
  const url = new URL(directions ? 'https://www.google.com/maps/dir/' : 'https://www.google.com/maps/search/');
  url.searchParams.set('api','1');
  url.searchParams.set(directions ? 'destination' : 'query', text);
  return url.href;
}

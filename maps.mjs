// Google Maps > Share or embed map > Embed a map, centered on downtown Taichung.
export const googleExploreEmbedUrl = 'https://www.google.com/maps/embed?pb=!1m10!1m8!1m3!1d29125.471413490483!2d120.67364819999999!3d24.1477358!3m2!1i1024!2i768!4f13.1!5e0!3m2!1szh-TW!2stw!4v1794151460460!5m2!1szh-TW!2stw';

export function mapSearchLinks(query, placeId) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) {
    throw new RangeError('Enter a place or address within 200 characters');
  }
  const google = new URL('https://www.google.com/maps/search/');
  google.searchParams.set('api', '1');
  google.searchParams.set('query', query.trim());
  if (placeId) google.searchParams.set('query_place_id', placeId);
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

let placesLibrary;

function loadPlaces(key) {
  placesLibrary ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const url = new URL('https://maps.googleapis.com/maps/api/js');
    url.search = new URLSearchParams({ key, loading: 'async', callback: 'fomeryPlacesReady', v: 'weekly', language: 'zh-TW', region: 'TW' });
    script.src = url.href;
    script.async = true;
    const timer = setTimeout(failed, 12_000);
    function failed() {
      clearTimeout(timer);
      delete window.fomeryPlacesReady;
      script.remove();
      reject(Error('Google 地圖暫時無法載入。'));
    }
    window.fomeryPlacesReady = () => {
      clearTimeout(timer);
      delete window.fomeryPlacesReady;
      resolve(window.google.maps.importLibrary('places'));
    };
    script.onerror = failed;
    document.head.append(script);
  }).catch(error => {
    placesLibrary = undefined;
    throw error;
  });
  return placesLibrary;
}

export async function findPlaces(query, key) {
  const { Place } = await loadPlaces(key);
  const { places } = await Place.searchByText({
    textQuery: query,
    fields: ['id', 'displayName', 'formattedAddress'],
    maxResultCount: 5,
    region: 'TW',
  });
  return places;
}

export async function suggestPlaces(input, key) {
  const { AutocompleteSuggestion } = await loadPlaces(key);
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, language: 'zh-TW', region: 'tw' });
  return suggestions.flatMap(({ placePrediction: place }) => place?.placeId ? [{
    id: place.placeId,
    displayName: (place.mainText || place.text).toString(),
    formattedAddress: place.secondaryText?.toString() || '',
  }] : []);
}

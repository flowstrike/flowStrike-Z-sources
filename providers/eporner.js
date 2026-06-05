var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'eporner';

var BASE = 'https://www.eporner.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getInfo() {
  return { name: 'Eporner', lang: 'en', baseUrl: BASE,
    logo: 'https://raw.githubusercontent.com/phisher98/TVVVV/main/eporner.ico',
    type: 'movie', version: '1.0.0' };
}

function _trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }

function _get(url) {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': BASE + '/'
    }
  }).then(function (r) { return r.body || ''; }).catch(function () { return ''; });
}

function _cleanTitle(raw) {
  return _trim(htmlText(raw || '').replace(/_/g, ' ')).replace(/\s+/g, ' ');
}

function _cards(html) {
  var out = [], seen = {};
  var blocks = html.split(/class="mb[\s"]/);
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i];
    var hrefM = block.match(/href="(\/video-[^"]+)"/i);
    var titleM = block.match(/class="mbtit"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    var imgM = block.match(/<img[^>]+src="(https?:\/\/[^"]+\.jpg[^"]*)"/i);
    if (!hrefM) continue;
    var url = absUrl(hrefM[1], BASE);
    if (seen[url] || !url) continue; seen[url] = 1;
    var title = titleM ? _cleanTitle(titleM[1]) : 'Untitled';
    var cover = imgM ? imgM[1] : null;
    out.push({
      id: url, title: title, cover: cover,
      url: url, type: 'movie', sourceId: SOURCE_ID
    });
  }
  return out;
}

function search(query, page, opts) {
  var q = (query || '').replace(/\s+/g, '-');
  return _get(BASE + '/search/' + q + '/' + (page || 1))
    .then(function (html) { return _cards(html); })
    .catch(function () { return []; });
}

function getHome(opts) {
  var rows = [
    { title: 'Recent', path: '' },
    { title: 'Best Videos', path: 'best-videos' },
    { title: 'Top Rated', path: 'top-rated' },
    { title: 'Most Viewed', path: 'most-viewed' },
    { title: '1080p', path: 'cat/hd-1080p' },
    { title: '4K', path: 'cat/4k-porn' }
  ];
  return Promise.all(rows.map(function (row) {
    var url = row.path ? (BASE + '/' + row.path + '/1/') : (BASE + '/');
    return _get(url).then(function (html) {
      return { title: row.title, items: _cards(html) };
    }).catch(function () { return { title: row.title, items: [] }; });
  })).catch(function () { return []; });
}

function _hexToBase36(hex) {
  if (hex.length < 32) return '';
  var chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  function fromHex(h) {
    var n = 0;
    for (var i = 0; i < h.length; i++) {
      var c = h.charAt(i);
      var v = c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 87;
      n = n * 16 + v;
    }
    return n;
  }
  function to36(n) {
    if (n === 0) return '0';
    var s = '';
    while (n > 0) { s = chars.charAt(n % 36) + s; n = Math.floor(n / 36); }
    return s;
  }
  return to36(fromHex(hex.substring(0, 8)))
       + to36(fromHex(hex.substring(8, 16)))
       + to36(fromHex(hex.substring(16, 24)))
       + to36(fromHex(hex.substring(24, 32)));
}

function _getMeta(html, prop) {
  var m = html.match(new RegExp('property="' + prop + '"[^>]*content="([^"]*)"', 'i'))
       || html.match(new RegExp('content="([^"]*)"[^>]*property="' + prop + '"', 'i'));
  return m ? _trim(m[1]) : '';
}

function getDetail(url, opts) {
  return _get(url).then(function (html) {
    var title = _getMeta(html, 'og:title') || 'Untitled';
    var poster = _getMeta(html, 'og:image') || null;
    var description = _getMeta(html, 'og:description') || '';
    return {
      id: url, title: title, cover: poster, url: url,
      description: description, status: 'unknown', genres: [],
      studios: [], type: 'movie', sourceId: SOURCE_ID,
      episodes: [{ id: 'movie', title: title, number: 1, url: url }],
      year: null, subCount: 1, dubCount: 0
    };
  });
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (d) { return d.episodes; });
}

function getVideoSources(episodeUrl) {
  return _get(episodeUrl).then(function (html) {
    var vidM = html.match(/EP\.video\.player\.vid\s*=\s*['"]([^'"]+)['"]/);
    var hashM = html.match(/EP\.video\.player\.hash\s*=\s*['"]([^'"]+)['"]/);
    if (!vidM || !hashM) return [];
    var vid = vidM[1];
    var hash = _hexToBase36(hashM[1]);
    if (!hash) return [];
    var xhrUrl = BASE + '/xhr/video/' + vid + '?hash=' + hash;
    return fetch(xhrUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': episodeUrl }
    }).then(function (r) {
      var j = null;
      try { j = JSON.parse(r.body || '{}'); } catch (e) { return []; }
      var sources = (j.sources && j.sources.mp4) || {};
      var out = [];
      var keys = Object.keys ? Object.keys(sources) : [];
      for (var i = 0; i < keys.length; i++) {
        var obj = sources[keys[i]];
        if (!obj || !obj.src) continue;
        var label = obj.labelShort || obj.label || keys[i];
        var qm = String(label).match(/(\d{3,4})/);
        var quality = qm ? qm[1] + 'p' : 'auto';
        var hls = /\.m3u8(\?|$)/i.test(obj.src);
        out.push({
          url: obj.src, quality: quality,
          container: hls ? 'hls' : 'mp4',
          headers: { 'User-Agent': UA },
          kind: 'sub', audioLang: '',
          subtitles: [],
          label: _trim('Eporner ' + label)
        });
      }
      return out;
    }).catch(function () { return []; });
  }).catch(function () { return []; });
}

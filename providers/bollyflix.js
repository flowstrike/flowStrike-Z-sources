var SOURCE_ID = 'bollyflix';
var URLS_JSON = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
var CINEMETA = 'https://v3-cinemeta.strem.io';
var SIDEXFEE = 'https://web.sidexfee.com';
var FALLBACK = 'https://bollyflix.ski';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

var _dom = null;
function _domains() {
  if (_dom) return Promise.resolve(_dom);
  return fetch(URLS_JSON, { headers: { 'User-Agent': UA } }).then(function(r) {
    var j = {}; try { j = JSON.parse(r.body || '{}'); } catch(e) {}
    _dom = (j.bollyflix || FALLBACK).replace(/\/$/, '');
    return _dom;
  }).catch(function() { _dom = FALLBACK; return _dom; });
}

function getInfo() {
  return { name: 'BollyFlix', lang: 'hi', baseUrl: FALLBACK,
    logo: FALLBACK + '/favicon.ico', type: 'movie', version: '1.0.1' };
}

function _trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
function _b64(s) {
  try { var b = base64ToBytes(String(s || '')); var o = '';
    for (var i = 0; i < b.length; i++) o += String.fromCharCode(b[i]); return o;
  } catch(e) { return ''; }
}
function _get(url, ref) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': ref || url } })
    .then(function(r) { return r.body || ''; }).catch(function() { return ''; });
}
function _quality(s) { var m = String(s || '').match(/(\d{3,4})[pP]/); return m ? (m[1] + 'p') : null; }

function _cards(html, base) {
  var out = [], seen = {};
  var re = /<article[\s\S]*?<\/article\s*>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var block = m[0];
    var hrefM = block.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
    var imgM = block.match(/<img[^>]*src="([^"]*)"[^>]*\/?>/i);
    var titleM = block.match(/<a[^>]*title="([^"]*)"[^>]*>/i)
              || block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    if (!hrefM) continue;
    var url = absUrl(hrefM[1], base);
    if (seen[url]) continue; seen[url] = 1;
    var title = titleM ? _trim(htmlText(titleM[1])).replace(/^Download\s*/i, '') : '';
    if (!title) continue;
    var cover = imgM ? absUrl(imgM[1], base) : null;
    out.push({
      id: url, title: title, cover: cover,
      url: url, type: 'movie', sourceId: SOURCE_ID
    });
  }
  return out;
}

function search(query, page, opts) {
  return _domains().then(function(base) {
    var q = (query || '').replace(/\s+/g, '+');
    var url = base + '/search/' + q + '/page/' + (page || 1) + '/';
    return _get(url, base + '/').then(function(html) { return _cards(html, base); });
  }).catch(function() { return []; });
}

function getHome(opts) {
  var rows = [
    { title: 'Latest', path: '/' },
    { title: 'Bollywood', path: '/movies/bollywood/' },
    { title: 'Hollywood', path: '/movies/hollywood/' },
    { title: 'Anime', path: '/anime/' }
  ];
  return _domains().then(function(base) {
    return Promise.all(rows.map(function(row) {
      return _get(base + row.path, base + '/').then(function(html) {
        return { title: row.title, items: _cards(html, base) };
      }).catch(function() { return { title: row.title, items: [] }; });
    }));
  }).catch(function() { return []; });
}

function _epUrl(hrefs) { return 'bflix://' + encodeURIComponent(JSON.stringify(hrefs)); }
function _epHrefs(url) {
  try { return JSON.parse(decodeURIComponent(String(url).replace(/^bflix:\/\//, ''))); }
  catch(e) { return []; }
}

function _src(url, quality, label) {
  var hls = /\.m3u8(\?|$)/i.test(url);
  return {
    url: url, quality: quality || 'auto', container: hls ? 'hls' : 'mp4',
    headers: { 'User-Agent': UA }, kind: 'sub', audioLang: '',
    subtitles: [], label: _trim(label || '')
  };
}

function _sidexBypass(token) {
  return _get(SIDEXFEE + '/?id=' + token).then(function(html) {
    var m = html.match(/link":"([^"]+)"/);
    if (!m) return '';
    return _b64(m[1].replace(/\\\//g, '/'));
  }).catch(function() { return ''; });
}

function _maybeBypass(url) {
  if (!url || url.indexOf('fastdlserver') !== -1) return Promise.resolve(url);
  var idx = url.indexOf('?id=');
  if (idx === -1) return Promise.resolve(url);
  var token = url.substring(idx + 4).split('&')[0].split('#')[0];
  return _sidexBypass(token).then(function(r) { return r || url; });
}

function _cinemeta(imdbId, mediaType) {
  if (!imdbId) return Promise.resolve(null);
  return fetch(CINEMETA + '/meta/' + mediaType + '/' + imdbId + '.json', { headers: { 'User-Agent': UA } })
    .then(function(r) { try { return JSON.parse(r.body || '{}').meta || null; } catch(e) { return null; } })
    .catch(function() { return null; });
}

function getDetail(url, opts) {
  return _domains().then(function(base) {
    return _get(url, base + '/').then(function(html) {
      var titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      var rawTitle = titleM ? _trim(htmlText(titleM[1])).replace(/\s*[-|].*/i, '').replace(/^Download\s*/i, '') : '';
      var coverM = html.match(/property="og:image"[^>]*content="([^"]*)"/i)
                || html.match(/content="([^"]*)"[^>]*property="og:image"/i);
      var cover = coverM ? coverM[1] : null;
      var descM = html.match(/<span[^>]*id="summary"[^>]*>([\s\S]*?)<\/span>/i);
      var description = descM ? _trim(htmlText(descM[1])) : '';
      var imdbM = html.match(/imdb\.com\/title\/(tt\d+)/i);
      var imdbId = imdbM ? imdbM[1] : '';
      var isSeries = /series/i.test(rawTitle) || /web-series/i.test(url);
      var mediaType = isSeries ? 'series' : 'movie';

      return _cinemeta(imdbId, mediaType).then(function(meta) {
        var finalTitle = (meta && meta.name) || rawTitle;
        var finalCover = cover || (meta && meta.poster) || null;
        var finalDesc = description || (meta && meta.description) || '';
        var year = null;
        if (meta && meta.year) year = parseInt(String(meta.year).split('-')[0], 10) || null;
        var genres = (meta && meta.genre) || [];

        return _buildEpisodes(url, html, isSeries).then(function(episodes) {
          return {
            id: url, title: finalTitle, cover: finalCover, url: url,
            description: finalDesc, status: 'unknown', genres: genres,
            studios: [], type: 'movie', sourceId: SOURCE_ID,
            episodes: episodes, year: year,
            subCount: episodes.length, dubCount: 0
          };
        });
      });
    });
  });
}

function _buildEpisodes(detailUrl, html, isSeries) {
  if (!isSeries) return Promise.resolve(_movieEpisodes(html));
  return _seriesEpisodes(detailUrl, html);
}

function _movieEpisodes(html) {
  var links = [];
  var re = /<a[^>]*class="[^"]*dl[^"]*"[^>]*href="([^"]*)"[^>]*>/gi, m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[1].indexOf('#') !== 0) links.push(m[1]);
  }
  links = links.filter(function(v, i, a) { return a.indexOf(v) === i; });
  if (!links.length) return [{ id: 'movie', title: 'Full Movie', number: 1, url: _epUrl(links) }];
  return [{ id: 'movie', title: 'Full Movie', number: 1, url: _epUrl(links) }];
}

function _seriesEpisodes(detailUrl, html) {
  var buttons = [];
  var re = /<a[^>]*class="[^"]*(?:maxbutton-download-links|dl|btnn)[^"]*"[^>]*href="([^"]*)"[^>]*>/gi, m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[1].indexOf('#') !== 0) buttons.push(m[1]);
  }
  buttons = buttons.filter(function(v, i, a) { return a.indexOf(v) < 0 || a.indexOf(v) === i; });
  if (!buttons.length) return Promise.resolve([]);

  return Promise.all(buttons.slice(0, 5).map(function(btn) {
    return _maybeBypass(btn).then(function(resolved) {
      if (!resolved) return [];
      return _get(resolved).then(function(pageHtml) {
        var eps = [];
        var epRe = /<h[1-6][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, em;
        while ((em = epRe.exec(pageHtml)) !== null) {
          var epUrl = em[1], epTitle = _trim(htmlText(em[2]));
          if (epUrl) eps.push({ url: absUrl(epUrl, resolved), title: epTitle });
        }
        return eps;
      }).catch(function() { return []; });
    }).catch(function() { return []; });
  })).then(function(all) {
    var eps = [], num = 1, seen = {};
    for (var i = 0; i < all.length; i++) {
      for (var j = 0; j < all[i].length; j++) {
        var ep = all[i][j];
        if (seen[ep.url]) continue; seen[ep.url] = 1;
        var epNumM = ep.title.match(/episode\s*(\d+)/i);
        var epNum = epNumM ? parseInt(epNumM[1], 10) : num;
        eps.push({ id: 'S1E' + epNum, number: epNum, title: ep.title || ('Episode ' + num), url: _epUrl([ep.url]) });
        num++;
      }
    }
    eps.sort(function(a, b) { return a.number - b.number; });
    for (var i = 0; i < eps.length; i++) eps[i].number = i + 1;
    return eps;
  });
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function(d) { return d.episodes; });
}

function _resolveGDFlix(url) {
  return _get(url).then(function(html) {
    var nameM = html.match(/list-group-item[^>]*>[\s\S]*?Name[\s\S]*?:[\s\S]*?<strong>([\s\S]*?)<\/strong>/i)
             || html.match(/list-group-item[^>]*>[\s\S]*?Name[\s\S]*?:[\s\S]*?<b>([\s\S]*?)<\/b>/i);
    var fileName = nameM ? _trim(htmlText(nameM[1])) : '';
    var q = _quality(fileName) || 'auto';
    var out = [];

    var re = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var href = m[1], text = _trim(htmlText(m[2])).toLowerCase();
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript') === 0) continue;
      if (href.indexOf('http') !== 0) continue;
      if (text.indexOf('direct') > -1 || text.indexOf('fsl') > -1 ||
          text.indexOf('download') > -1 || text.indexOf('server') > -1 ||
          text.indexOf('cloud') > -1) {
        out.push(_src(href, q, 'BollyFlix ' + text));
      }
    }

    if (!out.length) {
      var dlRe = /href="(https?:\/\/[^"]*\.(?:mkv|mp4)[^"]*)"/gi, dm;
      while ((dm = dlRe.exec(html)) !== null) {
        out.push(_src(dm[1], q, 'BollyFlix'));
      }
    }
    return out;
  }).catch(function() { return []; });
}

function _resolveFastDl(url) {
  return fetch(url, { headers: { 'User-Agent': UA }, followRedirects: false })
    .then(function(r) {
      var loc = (r.headers && r.headers.location) || '';
      if (loc) return [_src(loc, _quality(loc) || 'auto', 'BollyFlix')];
      var html = r.body || '';
      var m = html.match(/href="(https?:\/\/[^"]*\.(?:mkv|mp4)[^"]*)"/i);
      if (m) return [_src(m[1], _quality(m[1]) || 'auto', 'BollyFlix')];
      return [];
    }).catch(function() { return []; });
}

function _resolveHubCloud(url) {
  return _get(url).then(function(html) {
    var out = [];
    var dlRe = /href="(https?:\/\/[^"]*\.(?:mkv|mp4|m3u8)[^"]*)"/gi, m;
    while ((m = dlRe.exec(html)) !== null) {
      out.push(_src(m[1], _quality(m[1]) || 'auto', 'BollyFlix'));
    }
    return out;
  }).catch(function() { return []; });
}

function _resolveLink(url) {
  return _maybeBypass(url).then(function(resolved) {
    if (!resolved) return [];
    var l = resolved.toLowerCase();
    if (l.indexOf('gdflix') > -1 || l.indexOf('gdlink') > -1) return _resolveGDFlix(resolved);
    if (l.indexOf('fastdlserver') > -1) return _resolveFastDl(resolved);
    if (l.indexOf('hubcloud') > -1 || l.indexOf('vcloud') > -1) return _resolveHubCloud(resolved);
    return [_src(resolved, _quality(resolved) || 'auto', 'BollyFlix')];
  }).catch(function() { return []; });
}

function getVideoSources(episodeUrl) {
  var hrefs = _epHrefs(episodeUrl).slice(0, 10);
  if (!hrefs.length) return Promise.resolve([]);
  return Promise.all(hrefs.map(function(h) {
    return _resolveLink(typeof h === 'string' ? h : h.url || '');
  })).then(function(lists) {
    var out = [], seen = {};
    for (var i = 0; i < lists.length; i++) {
      for (var k = 0; k < lists[i].length; k++) {
        var s = lists[i][k];
        if (s && s.url && !seen[s.url]) { seen[s.url] = 1; out.push(s); }
      }
    }
    return out;
  });
}

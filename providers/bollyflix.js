var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'bollyflix';

var URLS_JSON = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
var CINEMETA = 'https://v3-cinemeta.strem.io';
var SIDEXFEE = 'https://web.sidexfee.com';
var FALLBACK = 'https://bollyflix.ski';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

var _dom = null;
function _domains() {
  if (_dom) return Promise.resolve(_dom);
  return fetch(URLS_JSON, { headers: { 'User-Agent': UA } }).then(function (r) {
    var j = {}; try { j = JSON.parse(r.body || '{}'); } catch (e) {}
    _dom = (j.bollyflix || FALLBACK).replace(/\/$/, '');
    return _dom;
  }).catch(function () { _dom = FALLBACK; return _dom; });
}

function getInfo() {
  return { name: 'BollyFlix', lang: 'hi', baseUrl: FALLBACK,
    logo: FALLBACK + '/favicon.ico', type: 'movie', version: '2.0.0' };
}

function _trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
function _b64(s) {
  try { var b = base64ToBytes(String(s || '')); var o = '';
    for (var i = 0; i < b.length; i++) o += String.fromCharCode(b[i]); return o;
  } catch (e) { return ''; }
}
function _get(url, ref) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': ref || url } })
    .then(function (r) { return r.body || ''; }).catch(function () { return ''; });
}
function _quality(s) { var m = String(s || '').match(/(\d{3,4})[pP]/); return m ? (m[1] + 'p') : null; }

function _cleanTitle(raw) {
  var t = htmlText(raw || '').replace(/^\s*download\s+/i, '');
  t = t.split(/\s*\(/)[0].split(/\bseason\b/i)[0].split(/\bS0?\d/)[0]
       .replace(/\b(480p|720p|1080p|2160p|4k|web[- ]?dl|hdrip|bluray|x264|x265|hevc|hindi|dual\s*audio|dual|multi).*$/i, '');
  return _trim(t) || _trim(htmlText(raw || ''));
}

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
    var title = titleM ? _cleanTitle(titleM[1]) : '';
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
  return _domains().then(function (base) {
    var q = (query || '').replace(/\s+/g, '+');
    var url = base + '/search/' + q + '/page/' + (page || 1) + '/';
    return _get(url, base + '/').then(function (html) { return _cards(html, base); });
  }).catch(function () { return []; });
}

function getHome(opts) {
  var rows = [
    { title: 'Latest', path: '/' },
    { title: 'Bollywood', path: '/movies/bollywood/' },
    { title: 'Hollywood', path: '/movies/hollywood/' },
    { title: 'Anime', path: '/anime/' }
  ];
  return _domains().then(function (base) {
    return Promise.all(rows.map(function (row) {
      return _get(base + row.path, base + '/').then(function (html) {
        return { title: row.title, items: _cards(html, base) };
      }).catch(function () { return { title: row.title, items: [] }; });
    }));
  }).catch(function () { return []; });
}

function _epUrl(hrefs) { return 'bflix://' + encodeURIComponent(JSON.stringify(hrefs)); }
function _epHrefs(url) {
  try { return JSON.parse(decodeURIComponent(String(url).replace(/^bflix:\/\//, ''))); }
  catch (e) { return []; }
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
  return _get(SIDEXFEE + '/?id=' + token).then(function (html) {
    var m = html.match(/link":"([^"]+)"/);
    if (!m) return '';
    return _b64(m[1].replace(/\\\//g, '/'));
  }).catch(function () { return ''; });
}

function _maybeBypass(url) {
  if (!url || url.indexOf('fastdlserver') !== -1) return Promise.resolve(url);
  var idx = url.indexOf('?id=');
  if (idx === -1) return Promise.resolve(url);
  var token = url.substring(idx + 4).split('&')[0].split('#')[0];
  return _sidexBypass(token).then(function (r) { return r || url; });
}

function _cinemeta(imdbId, mediaType) {
  if (!imdbId) return Promise.resolve(null);
  return fetch(CINEMETA + '/meta/' + mediaType + '/' + imdbId + '.json', { headers: { 'User-Agent': UA } })
    .then(function (r) { try { return JSON.parse(r.body || '{}').meta || null; } catch (e) { return null; } })
    .catch(function () { return null; });
}

function _releaseTags(title) {
  if (!title) return '';
  var U = (' ' + String(title).replace(/\.(mkv|mp4|avi|m4v)\s*$/i, '').replace(/[._]/g, ' ')
    .replace(/\bWEB[ -]?DL\b/ig, 'WEB-DL').replace(/\bWEB[ -]?RIP\b/ig, 'WEBRIP')
    .replace(/\bH[ .]?265\b/ig, 'H265').replace(/\bH[ .]?264\b/ig, 'H264')
    + ' ').toUpperCase();
  function has(re) { return re.test(U); }
  var out = [];
  var groups = [
    [['WEB-DL', /\bWEB-DL\b/], ['WEBRIP', /\bWEBRIP\b/], ['BLURAY', /\bBLU ?RAY\b|\bBDRIP\b/], ['HDRIP', /\bHDRIP\b/], ['HDTV', /\bHDTV\b/], ['DVDRIP', /\bDVDRIP\b/]],
    [['H265', /\bH265\b|\bHEVC\b/], ['X265', /\bX265\b/], ['H264', /\bH264\b/], ['X264', /\bX264\b/]],
    [['DDP5.1', /\bDDP5\.1\b/], ['DDP', /\bDDP\b/], ['DTS', /\bDTS\b/], ['AAC', /\bAAC\b/], ['AC3', /\bAC3\b/]]
  ];
  for (var g = 0; g < groups.length; g++) {
    for (var i = 0; i < groups[g].length; i++) {
      if (has(groups[g][i][1])) { out.push(groups[g][i][0]); break; }
    }
  }
  if (has(/\bATMOS\b/)) out.push('ATMOS');
  if (has(/\bHDR\b/)) out.push('HDR');
  if (has(/\bDUAL\b/)) out.push('DUAL');
  else if (has(/\bMULTI\b/)) out.push('MULTI');
  var seen = {}, res = [];
  for (var k = 0; k < out.length; k++) if (!seen[out[k]]) { seen[out[k]] = 1; res.push(out[k]); }
  return res.join(' ');
}
function _resLabel(q) { return /2160/.test(String(q || '')) ? '4K' : (q || ''); }
function _serverName(label) {
  var l = String(label || '').toLowerCase();
  if (l.indexOf('fsl') !== -1) return 'FSL Server';
  if (l.indexOf('buzz') !== -1) return 'Buzz Server';
  if (l.indexOf('pixeldra') !== -1 || l.indexOf('pixel') !== -1) return 'Pixeldrain';
  if (l.indexOf('s3') !== -1) return 'S3 Server';
  if (l.indexOf('10gb') !== -1) return '10Gbps';
  if (l.indexOf('mega') !== -1) return 'Mega';
  if (l.indexOf('download') !== -1) return 'Download';
  if (l.indexOf('cloud') !== -1) return 'Cloud';
  if (l.indexOf('direct') !== -1) return 'Direct';
  if (l.indexOf('instant') !== -1) return 'Instant';
  return 'Server';
}
function _name(server, info) {
  var n = 'BollyFlix [' + server + ']';
  if (info.tags) n += ' [' + info.tags + ']';
  if (info.size) n += ' [' + info.size + ']';
  if (info.res) n += ' ' + info.res;
  return n;
}

function getDetail(url, opts) {
  return _domains().then(function (base) {
    return _get(url, base + '/').then(function (html) {
      var titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      var rawTitle = titleM ? _trim(htmlText(titleM[1])).replace(/\s*[-|].*/i, '').replace(/^Download\s*/i, '') : '';
      var title = _cleanTitle(rawTitle);
      var coverM = html.match(/property="og:image"[^>]*content="([^"]*)"/i)
                || html.match(/content="([^"]*)"[^>]*property="og:image"/i);
      var cover = coverM ? coverM[1] : null;
      var descM = html.match(/<span[^>]*id="summary"[^>]*>([\s\S]*?)<\/span>/i);
      var description = descM ? _trim(htmlText(descM[1])) : '';
      var imdbM = html.match(/imdb\.com\/title\/(tt\d+)/i);
      var imdbId = imdbM ? imdbM[1] : '';
      var isSeries = /series/i.test(rawTitle) || /web-series/i.test(url);
      var mediaType = isSeries ? 'series' : 'movie';

      return _cinemeta(imdbId, mediaType).then(function (meta) {
        var finalTitle = (meta && meta.name) || title;
        var finalCover = cover || (meta && meta.poster) || null;
        var finalDesc = description || (meta && meta.description) || '';
        var year = null;
        if (meta && meta.year) year = parseInt(String(meta.year).split('-')[0].split('\u2013')[0], 10) || null;
        var genres = (meta && meta.genre) || [];

        return _buildEpisodes(url, html, isSeries).then(function (episodes) {
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
  links = links.filter(function (v, i, a) { return a.indexOf(v) === i; });
  return [{ id: 'movie', title: 'Full Movie', number: 1, url: _epUrl(links) }];
}

function _seriesEpisodes(detailUrl, html) {
  var buttons = [];
  var re = /<a[^>]*class="[^"]*(?:maxbutton-download-links|dl|btnn)[^"]*"[^>]*href="([^"]*)"[^>]*>/gi, m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[1].indexOf('#') !== 0) buttons.push(m[1]);
  }
  buttons = buttons.filter(function (v, i, a) { return a.indexOf(v) < 0 || a.indexOf(v) === i; });
  if (!buttons.length) return Promise.resolve([]);

  return Promise.all(buttons.slice(0, 5).map(function (btn) {
    return _maybeBypass(btn).then(function (resolved) {
      if (!resolved) return [];
      return _get(resolved).then(function (pageHtml) {
        var eps = [];
        var epRe = /<h[1-6][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, em;
        while ((em = epRe.exec(pageHtml)) !== null) {
          var epUrl = em[1], epTitle = _trim(htmlText(em[2]));
          if (epUrl) eps.push({ url: absUrl(epUrl, resolved), title: epTitle });
        }
        return eps;
      }).catch(function () { return []; });
    }).catch(function () { return []; });
  })).then(function (all) {
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
    eps.sort(function (a, b) { return a.number - b.number; });
    for (var i = 0; i < eps.length; i++) eps[i].number = i + 1;
    return eps;
  });
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (d) { return d.episodes; });
}

function _hubServer(link, label, info) {
  var server = _serverName(label);
  var name = _name(server, info);
  var q = info.quality;
  var l = String(label || '').toLowerCase();
  if (l.indexOf('buzz') !== -1) {
    return fetch(link + '/download', { headers: { 'Referer': link, 'User-Agent': UA }, followRedirects: false })
      .then(function (r) { var h = r.headers || {}; var dl = h['hx-redirect'] || h['HX-Redirect'] || ''; return dl ? _src(dl, q, name) : null; })
      .catch(function () { return null; });
  }
  if (l.indexOf('pixeldra') !== -1 || l.indexOf('pixel') !== -1) {
    var b = (link.match(/^(https?:\/\/[^/]+)/) || [])[1] || '';
    var fin = link.indexOf('download') !== -1 ? link : (b + '/api/file/' + link.replace(/\/$/, '').split('/').pop() + '?download');
    return Promise.resolve(_src(fin, q, name));
  }
  if (l.indexOf('fsl') !== -1 || l.indexOf('download') !== -1 || l.indexOf('s3') !== -1 || l.indexOf('10gb') !== -1 || l.indexOf('mega') !== -1 || l.indexOf('cloud') !== -1 || l.indexOf('direct') !== -1) {
    return Promise.resolve(_src(link, q, name));
  }
  if (/\.(mp4|mkv|m3u8)(\?|$)/i.test(link)) return Promise.resolve(_src(link, q, name));
  return Promise.resolve(null);
}

function _hubcloud(url) {
  var base = (url.match(/^(https?:\/\/[^/]+)/) || [])[1] || '';
  var step1 = url.indexOf('hubcloud.php') !== -1 ? Promise.resolve(url)
    : _get(url).then(function (html) {
        var raw = (html.match(/id=["']download["'][^>]*href="([^"]+)"/) ||
                   html.match(/href="([^"]+)"[^>]*id=["']download["']/) || [])[1] || '';
        if (!raw) return '';
        return /^https?:/i.test(raw) ? raw : (base + '/' + raw.replace(/^\//, ''));
      });
  return step1.then(function (href) {
    if (!href) return [];
    return _get(href).then(function (doc) {
      var title = htmlText((doc.match(/<div class="card-header[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
      var size = htmlText((doc.match(/id=["']size["'][^>]*>([\s\S]*?)<\//) || [])[1] || '');
      var quality = _quality(title) || '1080p';
      var info = { tags: _releaseTags(title), size: size, res: _resLabel(quality), quality: quality };
      var jobs = [], m;
      var re = /<a[^>]*href="([^"]+)"[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>([\s\S]*?)<\/a>|<a[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((m = re.exec(doc)) !== null) {
        var link = m[1] || m[3]; var text = htmlText(m[2] || m[4] || '').toLowerCase();
        if (link) jobs.push(_hubServer(link, text, info));
      }
      return Promise.all(jobs).then(function (lists) { var out = []; for (var i = 0; i < lists.length; i++) if (lists[i]) out.push(lists[i]); return out; });
    });
  }).catch(function () { return []; });
}

function _gdflix(url) {
  return _get(url).then(function (html) {
    var nameM = html.match(/list-group-item[^>]*>[\s\S]*?Name[\s\S]*?:[\s\S]*?<strong>([\s\S]*?)<\/strong>/i)
             || html.match(/list-group-item[^>]*>[\s\S]*?Name[\s\S]*?:[\s\S]*?<b>([\s\S]*?)<\/b>/i);
    var fileName = nameM ? _trim(htmlText(nameM[1])) : '';
    var sizeM = html.match(/list-group-item[^>]*>[\s\S]*?Size[\s\S]*?:[\s\S]*?<strong>([\s\S]*?)<\/strong>/i);
    var size = sizeM ? _trim(htmlText(sizeM[1])) : '';
    var quality = _quality(fileName) || '1080p';
    var info = { tags: _releaseTags(fileName), size: size, res: _resLabel(quality), quality: quality };

    var out = [], m;
    var re = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = re.exec(html)) !== null) {
      var href = m[1], text = _trim(htmlText(m[2])).toLowerCase();
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript') === 0) continue;
      if (href.indexOf('http') !== 0) continue;
      var server = _serverName(text);
      var label = _name(server, info);
      if (text.indexOf('fsl') > -1 || text.indexOf('direct') > -1 || text.indexOf('cloud') > -1 || text.indexOf('download') > -1 || text.indexOf('server') > -1 || text.indexOf('instant') > -1) {
        out.push(_src(href, quality, label));
      } else if (text.indexOf('pixeldra') > -1 || text.indexOf('pixel') > -1) {
        var b = (href.match(/^(https?:\/\/[^/]+)/) || [])[1] || '';
        var fin = href.indexOf('download') !== -1 ? href : (b + '/api/file/' + href.replace(/\/$/, '').split('/').pop() + '?download');
        out.push(_src(fin, quality, label));
      }
    }
    if (!out.length) {
      var dlRe = /href="(https?:\/\/[^"]*\.(?:mkv|mp4)[^"]*)"/gi, dm;
      while ((dm = dlRe.exec(html)) !== null) {
        out.push(_src(dm[1], quality, _name('Direct', info)));
      }
    }
    return out;
  }).catch(function () { return []; });
}

function _fastDl(url) {
  return fetch(url, { headers: { 'User-Agent': UA }, followRedirects: false })
    .then(function (r) {
      var loc = (r.headers && r.headers.location) || '';
      if (loc) return [_src(loc, _quality(loc) || 'auto', 'BollyFlix [FastDL]')];
      var html = r.body || '';
      var m = html.match(/href="(https?:\/\/[^"]*\.(?:mkv|mp4)[^"]*)"/i);
      if (m) return [_src(m[1], _quality(m[1]) || 'auto', 'BollyFlix [FastDL]')];
      return [];
    }).catch(function () { return []; });
}

function _hubdrive(url) {
  return _get(url).then(function (html) {
    var href = (html.match(/class="[^"]*btn-success1[^"]*"[^>]*href="([^"]+)"/) ||
                html.match(/href="([^"]+)"[^>]*class="[^"]*btn-success1/) || [])[1] || '';
    if (href) return _hubcloud(href);
    return [];
  }).catch(function () { return []; });
}

function _hblinks(url) {
  return _get(url).then(function (html) {
    var links = [], m; var re = /<a[^>]+href="([^"]+)"/g;
    while ((m = re.exec(html)) !== null) {
      var h = m[1].toLowerCase();
      if (h.indexOf('hubcloud') !== -1 || h.indexOf('hubdrive') !== -1) links.push(m[1]);
    }
    links = links.filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 5);
    return Promise.all(links.map(_dispatch)).then(function (ls) {
      return ls.reduce(function (a, b) { return a.concat(b || []); }, []);
    });
  }).catch(function () { return []; });
}

function _dispatch(link) {
  var l = String(link || '').toLowerCase();
  if (l.indexOf('hblinks') !== -1) return _hblinks(link);
  if (l.indexOf('hubcloud') !== -1 || l.indexOf('vcloud') !== -1) return _hubcloud(link);
  if (l.indexOf('hubdrive') !== -1) return _hubdrive(link);
  if (l.indexOf('gdflix') !== -1 || l.indexOf('gdlink') !== -1) return _gdflix(link);
  if (l.indexOf('fastdlserver') !== -1) return _fastDl(link);
  if (/\.(mp4|mkv|m3u8)(\?|$)/i.test(l)) return Promise.resolve([_src(link, _quality(link), 'BollyFlix')]);
  return Promise.resolve([]);
}

function _resolveLink(url) {
  return _maybeBypass(url).then(function (resolved) {
    if (!resolved) return [];
    return _dispatch(resolved);
  }).catch(function () { return []; });
}

function getVideoSources(episodeUrl) {
  var hrefs = _epHrefs(episodeUrl).slice(0, 10);
  if (!hrefs.length) return Promise.resolve([]);
  return Promise.all(hrefs.map(function (h) {
    return _resolveLink(typeof h === 'string' ? h : (h.url || ''));
  })).then(function (lists) {
    var out = [], seen = {};
    for (var i = 0; i < lists.length; i++) {
      var arr = lists[i] || [];
      for (var k = 0; k < arr.length; k++) {
        var s = arr[k];
        if (s && s.url && !seen[s.url]) { seen[s.url] = 1; out.push(s); }
      }
    }
    return out;
  });
}

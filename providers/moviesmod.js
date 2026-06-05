var SOURCE_ID = 'moviesmod';
var URLS_JSON = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
var CINEMETA = 'https://v3-cinemeta.strem.io';
var FALLBACK_URL = 'https://moviesmod.farm';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

var _mainUrl = '';

function _domains() {
  if (_mainUrl) return Promise.resolve(_mainUrl);
  return fetch(URLS_JSON, { headers: { 'User-Agent': UA } }).then(function(r) {
    var j = {};
    try { j = JSON.parse(r.body || '{}'); } catch(e) {}
    _mainUrl = (j.moviesmod || FALLBACK_URL).replace(/\/$/, '');
    return _mainUrl;
  }).catch(function() {
    _mainUrl = FALLBACK_URL;
    return _mainUrl;
  });
}

function _get(url, ref) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': ref || url } })
    .then(function(r) { return r.body || ''; })
    .catch(function() { return ''; });
}

function _regexMatch(str, pattern, group) {
  var m = str.match(pattern);
  if (m && m[group !== undefined ? group : 1]) return m[group !== undefined ? group : 1];
  return null;
}

function _decodeHtml(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function _extractMeta(html, prop) {
  var p1 = '<meta[^>]+property=["\']' + prop + '["\'][^>]+content=["\']([^"\']+)["\']';
  var m = html.match(new RegExp(p1, 'i'));
  if (!m) {
    var p2 = '<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']' + prop + '["\']';
    m = html.match(new RegExp(p2, 'i'));
  }
  return m ? _decodeHtml(m[1]) : null;
}

function _cleanTitle(t) {
  return (t || '')
    .replace(/^Download\s*/i, '')
    .replace(/\s*MoviesMod.*$/i, '')
    .replace(/\s*\|\s*S-?Pack.*$/i, '')
    .replace(/\s*\(\d{4}\).*$/i, '')
    .trim();
}

function _quality(name) {
  if (/2160[pP]|4[kK]/.test(name)) return 2160;
  if (/1080[pP]/.test(name)) return 1080;
  if (/720[pP]/.test(name)) return 720;
  if (/480[pP]/.test(name)) return 480;
  if (/360[pP]/.test(name)) return 360;
  return 0;
}

function _extractImdb(html) {
  var m = html.match(/href="[^"]*imdb\.com\/title\/(tt\d+)/i);
  return m ? m[1] : '';
}

function _isSeries(html) {
  return /season/i.test(html);
}

function _decodeB64Url(str) {
  try {
    if (str.indexOf('url=') !== -1) str = str.split('url=').pop();
    var bytes = base64ToBytes(str);
    var r = '';
    for (var i = 0; i < bytes.length; i++) r += String.fromCharCode(bytes[i]);
    return decodeURIComponent(r);
  } catch (e) {
    return str;
  }
}

function _extractCards(html, base) {
  var cards = [];
  var articles = html.match(/<article[\s\S]*?<\/article\s*>/gi) || [];

  for (var i = 0; i < articles.length; i++) {
    var art = articles[i];

    var aHref = _regexMatch(art, /<a[^>]+href="([^"]+)"[^>]*(?:title="([^"]*)")?/i, 1);
    if (!aHref)
      aHref = _regexMatch(art, /<a[^>]+(?:title="([^"]*)")?[^>]+href="([^"]+)"/i, 2);

    var title = _regexMatch(art, /title="([^"]+)"/i, 1) ||
                _regexMatch(art, /<a[^>]*>([\s\S]*?)<\/a>/i, 1);
    if (title) title = _cleanTitle(_decodeHtml(htmlText(title)));

    var poster = _regexMatch(art, /<img[^>]+src="([^"]+)"/i, 1);
    if (!poster) poster = _regexMatch(art, /<img[^>]+src='([^']+)'/i, 1);
    if (poster) poster = _decodeHtml(poster);

    if (aHref) {
      var cardUrl = absUrl(_decodeHtml(aHref), base);
      cards.push({
        id: cardUrl, title: title || 'Untitled', cover: poster ? absUrl(poster, base) : null,
        url: cardUrl, type: 'movie', sourceId: SOURCE_ID
      });
    }
  }
  return cards;
}

function _parseEpisodesFromPage(url, seasonNum) {
  return _get(url).then(function(html) {
    var episodes = [];
    var sectionRe = /<h[34][^>]*>([\s\S]*?)<\/h[34]>([\s\S]*?)(?=<h[34][^>]*>|$)/gi;
    var currentSeason = seasonNum || 1;
    var m2;

    while ((m2 = sectionRe.exec(html)) !== null) {
      var headerText = htmlText(m2[1]);
      var sectionContent = m2[2];

      var seasonMatch = headerText.match(/season\s+(\d+)/i);
      if (seasonMatch) currentSeason = parseInt(seasonMatch[1], 10);

      var epRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      var em;
      while ((em = epRe.exec(sectionContent)) !== null) {
        var epText = htmlText(em[2]).trim();
        var epHref = absUrl(_decodeHtml(em[1]), url.match(/https?:\/\/[^\/]+/i)[0]);
        var epMatch = epText.match(/episode\s+(\d+)/i);

        if (epMatch) {
          episodes.push({
            season: currentSeason,
            episode: parseInt(epMatch[1], 10),
            title: epText,
            href: epHref
          });
        }
      }
    }

    if (episodes.length === 0) {
      var allLinks = html.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) || [];
      for (var i = 0; i < allLinks.length; i++) {
        var aHref = _regexMatch(allLinks[i], /href="([^"]+)"/i, 1);
        var aText = htmlText(_regexMatch(allLinks[i], /<a[^>]*>([\s\S]*?)<\/a>/i, 1) || '').trim();
        var epM = aText.match(/episode\s+(\d+)/i);
        if (epM) {
          episodes.push({
            season: currentSeason,
            episode: parseInt(epM[1], 10),
            title: aText,
            href: absUrl(_decodeHtml(aHref), url.match(/https?:\/\/[^\/]+/i)[0])
          });
        }
      }
    }

    return episodes;
  }).catch(function() { return []; });
}

function _fetchDriveleechLinks(url) {
  return _get(url).then(function(html) {
    var text = htmlText(html);
    var sources = [];

    var fileName = '';
    var fnMatch = text.match(/Name[:\s]*([^\n]+)/i);
    if (fnMatch) fileName = fnMatch[1].trim();

    var fileSize = '';
    var fsMatch = text.match(/Size[:\s]*([^\n]+)/i);
    if (fsMatch) fileSize = fsMatch[1].trim();

    var quality = _quality(fileName + ' ' + fileSize);

    var baseHost = url.match(/https?:\/\/[^\/]+/i)[0];
    var linkMatches = html.match(/href="([^"]+)"/gi) || [];

    var deferred = [];

    for (var i = 0; i < linkMatches.length; i++) {
      var href = _regexMatch(linkMatches[i], /href="([^"]+)"/i, 1);
      if (!href) continue;
      href = _decodeHtml(href);
      href = absUrl(href, baseHost);

      var btnText = '';
      if (/cloud\s*download/i.test(linkMatches[i])) btnText = 'Cloud Download';
      else if (/instant\s*download/i.test(linkMatches[i])) btnText = 'Instant Download';
      else if (/direct\s*link/i.test(linkMatches[i])) btnText = 'Direct Links';
      else if (/resume\s*cloud/i.test(linkMatches[i])) btnText = 'Resume Cloud';
      else continue;

      var label = 'Moviesmod ' + btnText + (fileName ? ' ' + fileName : '') + (fileSize ? ' [' + fileSize + ']' : '');

      if (btnText === 'Cloud Download') {
        sources.push({ url: href, quality: quality, label: label });
      } else if (btnText === 'Instant Download') {
        deferred.push(
          _get(href).then(function(body) {
            var urlParam = _regexMatch(body, /[?&]url=([^&"'\s]+)/i, 1);
            if (urlParam) {
              return { url: decodeURIComponent(urlParam), quality: quality, label: label };
            }
            return null;
          }).catch(function() { return null; })
        );
      } else if (btnText === 'Direct Links') {
        var directUrl = href + (href.indexOf('?') === -1 ? '?' : '&') + 'type=1';
        deferred.push(
          _get(directUrl).then(function(body) {
            var dLinks = body.match(/<a[^>]+class="[^"]*btn-success[^"]*"[^>]+href="([^"]+)"/gi) || [];
            var result = [];
            for (var j = 0; j < dLinks.length; j++) {
              var dUrl = _regexMatch(dLinks[j], /href="([^"]+)"/i, 1);
              if (dUrl) result.push({ url: absUrl(_decodeHtml(dUrl), baseHost), quality: quality, label: label });
            }
            return result;
          }).catch(function() { return []; })
        );
      } else if (btnText === 'Resume Cloud') {
        deferred.push(
          _get(href).then(function(body) {
            var rcLinks = body.match(/<a[^>]+class="[^"]*btn-success[^"]*"[^>]+href="([^"]+)"/gi) || [];
            var result = [];
            for (var k = 0; k < rcLinks.length; k++) {
              var rcUrl = _regexMatch(rcLinks[k], /href="([^"]+)"/i, 1);
              if (rcUrl) result.push({ url: absUrl(_decodeHtml(rcUrl), baseHost), quality: quality, label: label });
            }
            return result;
          }).catch(function() { return []; })
        );
      }
    }

    var wfileUrl = url.replace(/\/file\//, '/wfile/');
    if (wfileUrl !== url) {
      var types = ['1', '2'];
      for (var t = 0; t < types.length; t++) {
        var cfUrl = wfileUrl + (wfileUrl.indexOf('?') === -1 ? '?' : '&') + 'type=' + types[t];
        deferred.push(
          _get(cfUrl).then(function(body) {
            var cfLinks = body.match(/<a[^>]+class="[^"]*btn-success[^"]*"[^>]+href="([^"]+)"/gi) || [];
            var result = [];
            for (var c = 0; c < cfLinks.length; c++) {
              var cfHref = _regexMatch(cfLinks[c], /href="([^"]+)"/i, 1);
              if (cfHref) result.push({ url: absUrl(_decodeHtml(cfHref), baseHost), quality: quality, label: 'Moviesmod CF Backup' + (fileName ? ' ' + fileName : '') + (fileSize ? ' [' + fileSize + ']' : '') });
            }
            return result;
          }).catch(function() { return []; })
        );
      }
    }

    if (deferred.length === 0) return sources;

    return Promise.all(deferred.map(function(p) { return p.catch(function() { return null; }); })).then(function(results) {
      for (var i = 0; i < results.length; i++) {
        if (!results[i]) continue;
        if (Array.isArray(results[i])) {
          for (var j = 0; j < results[i].length; j++) sources.push(results[i][j]);
        } else {
          sources.push(results[i]);
        }
      }
      return sources;
    });
  }).catch(function() { return []; });
}

function _fetchVideoFromLink(linkUrl) {
  return _get(linkUrl).then(function(html) {
    var host = linkUrl.match(/https?:\/\/[^\/]+/i)[0];

    if (/driveleech|driveseed/i.test(linkUrl)) {
      var redirectMatch = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/);
      if (redirectMatch) {
        var resolvedUrl = absUrl(redirectMatch[1], host);
        return _fetchDriveleechLinks(resolvedUrl);
      }
      return _fetchDriveleechLinks(linkUrl);
    }

    var urlMatch = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/);
    if (urlMatch) {
      var resolved = absUrl(urlMatch[1], host);
      if (/driveleech|driveseed/i.test(resolved)) {
        return _fetchDriveleechLinks(resolved);
      }
      return _fetchVideoFromLink(resolved);
    }

    var btnLinks = html.match(/<a[^>]+class="[^"]*(?:maxbutton|maxbutton-\d|btn-success)[^"]*"[^>]+href="([^"]+)"/gi) || [];
    var btnPromises = [];
    for (var i = 0; i < btnLinks.length; i++) {
      var href = _regexMatch(btnLinks[i], /href="([^"]+)"/i, 1);
      if (href) {
        btnPromises.push(_fetchVideoFromLink(absUrl(_decodeHtml(href), host)));
      }
    }

    var sources = [];
    var directVideo = html.match(/href="(https?:\/\/[^"]*\.(?:mp4|mkv|m3u8)[^"]*)"/i);
    if (directVideo) {
      sources.push({ url: directVideo[1], quality: _quality(directVideo[1]), label: 'Moviesmod Direct' });
    }

    if (btnPromises.length === 0) return sources;

    return Promise.all(btnPromises.map(function(p) { return p.catch(function() { return []; }); })).then(function(all) {
      for (var i = 0; i < all.length; i++) {
        for (var j = 0; j < all[i].length; j++) sources.push(all[i][j]);
      }
      return sources;
    });
  }).catch(function() { return []; });
}

function _getButtons(html) {
  var buttons = [];
  var re = /<a[^>]+class="[^"]*(?:maxbutton-episode-links|maxbutton-g-drive|maxbutton-af-download)[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    buttons.push({ href: _decodeHtml(m[1]), text: htmlText(m[2]).trim() });
  }
  return buttons;
}

function getInfo() {
  return {
    id: 'moviesmod',
    name: 'Moviesmod',
    version: '1.0.0',
    type: 'movie',
    lang: 'en',
    nsfw: false
  };
}

function search(query, page, opts) {
  return _domains().then(function(base) {
    var p = page || 1;
    var q = query.replace(/\s+/g, '-').toLowerCase();
    var url = base + '/search/' + q + '/page/' + p;

    return _get(url).then(function(html) {
      var results = [];
      var articles = html.match(/<article[\s\S]*?<\/article\s*>/gi) || [];

      for (var i = 0; i < articles.length; i++) {
        var art = articles[i];
        var match = art.match(/<a[^>]+href="([^"]+)"[^>]+[^>]*title="([^"]*)"/i);
        if (!match) {
          match = art.match(/<a[^>]+title="([^"]*)"[^>]+href="([^"]+)"/i);
          if (match) match = [null, match[2], match[1]];
        }
        if (!match) continue;

        var href = _decodeHtml(match[1]);
        var title = match[2] ? _cleanTitle(_decodeHtml(match[2])) : '';

        var poster = _regexMatch(art, /<img[^>]+src="([^"]+)"/i, 1);
        if (!poster) poster = _regexMatch(art, /<img[^>]+src='([^']+)'/i, 1);
        if (poster) poster = _decodeHtml(poster);

        results.push({
          id: absUrl(href, base), title: title || 'Untitled', cover: poster ? absUrl(poster, base) : null,
          url: absUrl(href, base), type: 'movie', sourceId: SOURCE_ID
        });
      }

      return results;
    });
  });
}

function getHome(opts) {
  return _domains().then(function(base) {
    var sections = [
      { name: 'Latest', url: base + '/page/1/' },
      { name: 'Ongoing Series', url: base + '/web-series/on-going/page/1/' },
      { name: 'Movies', url: base + '/movies/page/1/' },
      { name: 'Animated Series', url: base + '/animated-web-series/page/1/' }
    ];

    var promises = sections.map(function(sec) {
      return _get(sec.url).then(function(html) {
        return { title: sec.name, items: _extractCards(html, base) };
      }).catch(function() {
        return { title: sec.name, items: [] };
      });
    });

    return Promise.all(promises);
  });
}

function getDetail(url, opts) {
  return _get(url).then(function(html) {
    var base = _mainUrl || FALLBACK_URL;
    var detail = {
      title: '',
      poster: '',
      description: '',
      imdbId: '',
      isSeries: false,
      type: 'movie',
      url: url
    };

    var title = _extractMeta(html, 'og:title');
    if (title) title = _cleanTitle(_decodeHtml(title));
    detail.title = title || '';

    var poster = _extractMeta(html, 'og:image');
    if (poster) detail.poster = absUrl(_decodeHtml(poster), base);

    var descMatch = html.match(/<div[^>]+class="[^"]*imdbwp__teaser[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) detail.description = htmlText(descMatch[1]).trim();

    detail.imdbId = _extractImdb(html);
    detail.isSeries = _isSeries(html);
    detail.type = detail.isSeries ? 'series' : 'movie';

    if (detail.imdbId) {
      var metaType = detail.isSeries ? 'series' : 'movie';
      var metaUrl = CINEMETA + '/meta/' + metaType + '/' + detail.imdbId + '.json';

      return _get(metaUrl).then(function(body) {
        try {
          var metaJson = JSON.parse(body);
          if (metaJson && metaJson.meta) {
            if (!detail.title && metaJson.meta.name) detail.title = metaJson.meta.name;
            if (!detail.poster && metaJson.meta.poster) detail.poster = metaJson.meta.poster;
            if (!detail.description && metaJson.meta.description) detail.description = metaJson.meta.description;
          }
        } catch (e) {}
        return detail;
      }).catch(function() { return detail; });
    }

    return detail;
  });
}

function getEpisodes(url, opts) {
  return _get(url).then(function(html) {
    var episodes = [];
    if (!_isSeries(html)) return episodes;

    var buttons = _getButtons(html);
    var buttonPromises = [];
    var currentSeason = 1;

    for (var b = 0; b < buttons.length; b++) {
      var btn = buttons[b];
      var seasonMatch = btn.text.match(/season\s+(\d+)/i);
      var seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : currentSeason;
      if (seasonMatch) currentSeason = seasonNum;

      var targetUrl = btn.href;
      if (targetUrl.indexOf('url=') !== -1) {
        try { targetUrl = _decodeB64Url(targetUrl); } catch (e) {}
      }

      buttonPromises.push(_parseEpisodesFromPage(targetUrl, seasonNum));
    }

    if (buttonPromises.length === 0) {
      var h3Re = /<h[34][^>]*>([\s\S]*?)<\/h[34]>([\s\S]*?)(?=<h[34][^>]*>|$)/gi;
      var m;
      var sNum = 1;
      while ((m = h3Re.exec(html)) !== null) {
        var header = htmlText(m[1]);
        var body = m[2];
        var sM = header.match(/season\s+(\d+)/i);
        if (sM) sNum = parseInt(sM[1], 10);

        var aRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var am;
        while ((am = aRe.exec(body)) !== null) {
          var epText = htmlText(am[2]).trim();
          var epHref = _decodeHtml(am[1]);
          var epMatch = epText.match(/episode\s+(\d+)/i);
          if (epMatch) {
            episodes.push({
              season: sNum,
              episode: parseInt(epMatch[1], 10),
              title: epText,
              href: absUrl(epHref, url.match(/https?:\/\/[^\/]+/i)[0])
            });
          }
        }
      }

      if (episodes.length === 0) {
        var maxBtnRe = /<a[^>]+class="[^"]*(?:maxbutton-episode-links|maxbutton-g-drive|maxbutton-af-download)[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var mbm;
        var sNum2 = 1;
        while ((mbm = maxBtnRe.exec(html)) !== null) {
          var btnHref = _decodeHtml(mbm[1]);
          var btnText = htmlText(mbm[2]).trim();
          var sMatch = btnText.match(/season\s+(\d+)/i);
          if (sMatch) sNum2 = parseInt(sMatch[1], 10);

          var resolvedUrl = btnHref;
          if (resolvedUrl.indexOf('url=') !== -1) {
            try { resolvedUrl = _decodeB64Url(resolvedUrl); } catch (e) {}
          }

          buttonPromises.push(_parseEpisodesFromPage(resolvedUrl, sNum2));
        }
      }

      if (buttonPromises.length === 0) return episodes;
    }

    return Promise.all(buttonPromises.map(function(p) { return p.catch(function() { return []; }); })).then(function(allEps) {
      for (var i = 0; i < allEps.length; i++) {
        for (var j = 0; j < allEps[i].length; j++) {
          episodes.push(allEps[i][j]);
        }
      }
      return episodes;
    });
  });
}

function getVideoSources(episodeUrl) {
  var decodedUrl = episodeUrl;

  if (episodeUrl.indexOf('mmod://') === 0) {
    try {
      var encoded = episodeUrl.substring('mmod://'.length);
      var jsonStr = decodeURIComponent(encoded);
      var hrefs = JSON.parse(jsonStr);
      if (Array.isArray(hrefs)) {
        var promises = hrefs.map(function(h) { return getVideoSources(h); });
        return Promise.all(promises.map(function(p) { return p.catch(function() { return []; }); })).then(function(all) {
          var result = [];
          for (var i = 0; i < all.length; i++) {
            for (var j = 0; j < all[i].length; j++) result.push(all[i][j]);
          }
          return result;
        });
      }
      decodedUrl = jsonStr;
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  return _get(decodedUrl).then(function(html) {
    var host = decodedUrl.match(/https?:\/\/[^\/]+/i)[0];

    if (/driveleech|driveseed/i.test(decodedUrl)) {
      return _fetchDriveleechLinks(decodedUrl);
    }

    var redirMatch = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/);
    if (redirMatch) {
      var redirUrl = absUrl(redirMatch[1], host);
      if (/driveleech|driveseed/i.test(redirUrl)) {
        return _fetchDriveleechLinks(redirUrl);
      }
      return getVideoSources(redirUrl);
    }

    var maxBtns = html.match(/<a[^>]+class="[^"]*(?:maxbutton-1|maxbutton-5|maxbutton-download-links)[^"]*"[^>]+href="([^"]+)"/gi) || [];
    var btnPromises = [];
    for (var i = 0; i < maxBtns.length; i++) {
      var href = _regexMatch(maxBtns[i], /href="([^"]+)"/i, 1);
      if (href) btnPromises.push(getVideoSources(absUrl(_decodeHtml(href), host)));
    }

    var sources = [];

    if (btnPromises.length === 0) {
      var allBtns = html.match(/<a[^>]+class="[^"]*maxbutton[^"]*"[^>]+href="([^"]+)"/gi) || [];
      for (var k = 0; k < allBtns.length; k++) {
        var bHref = _regexMatch(allBtns[k], /href="([^"]+)"/i, 1);
        if (bHref) btnPromises.push(_fetchVideoFromLink(absUrl(_decodeHtml(bHref), host)));
      }
    }

    if (btnPromises.length === 0) {
      var videoLinks = html.match(/href="(https?:\/\/[^"]*(?:driveleech|driveseed|hubcloud|gdflix|gdlink)[^"]*)"/gi) || [];
      for (var v = 0; v < videoLinks.length; v++) {
        var vUrl = _regexMatch(videoLinks[v], /href="([^"]+)"/i, 1);
        if (vUrl) btnPromises.push(_fetchVideoFromLink(_decodeHtml(vUrl)));
      }
    }

    if (btnPromises.length === 0) return sources;

    return Promise.all(btnPromises.map(function(p) { return p.catch(function() { return []; }); })).then(function(all) {
      for (var i = 0; i < all.length; i++) {
        for (var j = 0; j < all[i].length; j++) sources.push(all[i][j]);
      }
      return sources;
    });
  }).catch(function() { return []; });
}

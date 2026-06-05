var SOURCE_ID = 'bollyflix';
var URLS_JSON_URL = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
var CINEMETA_URL = 'https://v3-cinemeta.strem.io';
var SIDEXFEE_URL = 'https://web.sidexfee.com';
var FALLBACK_BASE = 'https://bollyflix.ski';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

var _baseUrl = '';

function getBaseUrl() {
  if (_baseUrl) return Promise.resolve(_baseUrl);
  return fetch(URLS_JSON_URL).then(function(r) {
    var d = JSON.parse(r.body);
    _baseUrl = d.bollyflix || FALLBACK_BASE;
    return _baseUrl;
  }).catch(function() {
    _baseUrl = FALLBACK_BASE;
    return _baseUrl;
  });
}

function getInfo() {
  return {
    name: 'BollyFlix',
    lang: 'hi',
    baseUrl: FALLBACK_BASE,
    logo: '',
    type: 'movie',
    version: '1.0.0'
  };
}

function extractQuality(str) {
  if (!str) return 'auto';
  var m = String(str).match(/(\d{3,4})p/i);
  if (m) return m[1] + 'p';
  var low = String(str).toLowerCase();
  if (low.indexOf('4k') > -1 || low.indexOf('uhd') > -1) return '2160p';
  if (low.indexOf('2k') > -1) return '1440p';
  return 'auto';
}

function bytesToStr(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

function resolveUrl(href, base) {
  if (!href) return '';
  return absUrl(href, base || _baseUrl || FALLBACK_BASE);
}

function bypassSidexfee(token) {
  return fetch(SIDEXFEE_URL + '/?id=' + token, {
    headers: { 'User-Agent': UA }
  }).then(function(r) {
    var html = r.body;
    var m = html.match(/link":"([^"]+)"/);
    if (!m) return null;
    try {
      return bytesToStr(base64ToBytes(m[1]));
    } catch (e) {
      return null;
    }
  }).catch(function() {
    return null;
  });
}

function needsSidexfee(url) {
  return url && url.indexOf('fastdlserver') === -1 && url.indexOf('?id=') > -1;
}

function maybeBypass(url) {
  if (!url) return Promise.resolve(null);
  if (needsSidexfee(url)) {
    var token = url.substring(url.indexOf('id=') + 3);
    token = token.split('&')[0].split('#')[0];
    return bypassSidexfee(token);
  }
  return Promise.resolve(url);
}

function parseArticleCards(html, base) {
  var results = [];
  var blocks = html.match(/<article[\s\S]*?<\/article\s*>/gi) || [];

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];

    var hrefM = block.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
    var imgM = block.match(/<img[^>]*src="([^"]*)"[^>]*\/?>/i);
    var titleM = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);

    if (!hrefM || !titleM) continue;

    var url = hrefM[1];
    var cover = imgM ? imgM[1] : '';
    var title = htmlText(titleM[1]).trim();

    if (!title || !url) continue;

    var isSeries = title.toLowerCase().indexOf('series') > -1 ||
                   url.toLowerCase().indexOf('web-series') > -1;

    results.push({
      id: resolveUrl(url, base),
      title: title,
      cover: resolveUrl(cover, base),
      url: resolveUrl(url, base),
      type: isSeries ? 'series' : 'movie',
      sourceId: SOURCE_ID
    });
  }

  return results;
}

function search(query, page, opts) {
  return getBaseUrl().then(function(base) {
    var p = page || 1;
    var q = query.replace(/\s+/g, '+');
    var url = base + '/search/' + q + '/page/' + p + '/';
    return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) {
      return parseArticleCards(r.body, base);
    });
  });
}

function getHome(opts) {
  return getBaseUrl().then(function(base) {
    var cats = [
      { title: 'Latest', path: '/' },
      { title: 'Bollywood', path: '/movies/bollywood/' },
      { title: 'Hollywood', path: '/movies/hollywood/' },
      { title: 'Anime', path: '/anime/' }
    ];

    var promises = cats.map(function(cat) {
      return fetch(base + cat.path, { headers: { 'User-Agent': UA } })
        .then(function(r) {
          return { title: cat.title, items: parseArticleCards(r.body, base) };
        })
        .catch(function() {
          return { title: cat.title, items: [] };
        });
    });

    return Promise.all(promises);
  });
}

function extractImdbId(html) {
  var m = html.match(/imdb\.com\/title\/(tt\d+)/i);
  return m ? m[1] : '';
}

function isSeriesPage(html, url) {
  var titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  var pageTitle = titleM ? htmlText(titleM[1]).toLowerCase() : '';
  return pageTitle.indexOf('series') > -1 || url.toLowerCase().indexOf('web-series') > -1;
}

function extractGenres(html) {
  var genres = [];
  var regex = /<a[^>]*href="[^"]*\/(?:genre|category)\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = regex.exec(html)) !== null) {
    var g = htmlText(m[1]).trim();
    if (g && genres.indexOf(g) === -1) genres.push(g);
  }
  return genres;
}

function fetchCinemeta(imdbId, mediaType) {
  if (!imdbId) return Promise.resolve(null);
  return fetch(CINEMETA_URL + '/meta/' + mediaType + '/' + imdbId + '.json')
    .then(function(r) {
      try {
        return JSON.parse(r.body).meta || null;
      } catch (e) {
        return null;
      }
    })
    .catch(function() {
      return null;
    });
}

function buildMovieEpisodes(html, baseUrl) {
  var links = [];

  var dlRegex = /<a[^>]*class="[^"]*dl[^"]*"[^>]*href="([^"]*)"[^>]*>/gi;
  var m;
  while ((m = dlRegex.exec(html)) !== null) {
    if (m[1] && m[1].indexOf('#') !== 0) {
      links.push(m[1]);
    }
  }

  if (links.length === 0) {
    var hRegex = /<h[45][^>]*>([\s\S]*?)<\/h[45]>\s*(<[\s\S]*?)(?=<h[45][^>]*>|<!--|<\/div>\s*<\/div>|$)/gi;
    var hM;
    while ((hM = hRegex.exec(html)) !== null) {
      var heading = htmlText(hM[1]);
      if (heading.match(/\d{3,4}p/i) && heading.toLowerCase().indexOf('download') === -1) {
        var section = hM[2];
        var aM = section.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
        if (aM && aM[1] && aM[1].indexOf('#') !== 0) {
          links.push(aM[1]);
        }
      }
    }
  }

  if (links.length === 0) {
    var allLinks = html.match(/<a[^>]*href="(https?:\/\/[^"]*(?:sidexfee|gdflix|fastdlserver|gdlink)[^"]*)"[^>]*>/gi);
    if (allLinks) {
      for (var i = 0; i < allLinks.length; i++) {
        var lM = allLinks[i].match(/href="([^"]*)"/i);
        if (lM) links.push(lM[1]);
      }
    }
  }

  var uniqueLinks = [];
  var seen = {};
  for (var i = 0; i < links.length; i++) {
    var resolved = resolveUrl(links[i], baseUrl);
    if (!seen[resolved]) {
      seen[resolved] = true;
      uniqueLinks.push(resolved);
    }
  }

  if (uniqueLinks.length === 0) {
    return [{
      id: 'bflix://[]',
      number: 1,
      title: 'Full Movie',
      url: 'bflix://[]'
    }];
  }

  var epUrl = 'bflix://' + JSON.stringify(uniqueLinks.map(function(l) {
    return { url: l };
  }));

  return [{
    id: epUrl,
    number: 1,
    title: 'Full Movie',
    url: epUrl
  }];
}

function resolveButtonToEpisodes(btnUrl) {
  return maybeBypass(btnUrl).then(function(resolvedUrl) {
    if (!resolvedUrl) return [];

    return fetch(resolvedUrl, { headers: { 'User-Agent': UA } }).then(function(r) {
      var pageHtml = r.body;
      var episodes = [];

      var epRegex = /<(?:article|div)[^>]*>[\s\S]*?<h[1-6][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[1-6]>/gi;
      var epM;
      while ((epM = epRegex.exec(pageHtml)) !== null) {
        var epUrl = resolveUrl(epM[1], resolvedUrl);
        var epTitle = htmlText(epM[2]).trim();
        if (epUrl) {
          episodes.push({ url: epUrl, title: epTitle });
        }
      }

      if (episodes.length === 0) {
        var h3Regex = /<h[1-6][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[1-6]>/gi;
        while ((epM = h3Regex.exec(pageHtml)) !== null) {
          var t = htmlText(epM[2]).trim();
          if (t.match(/episode\s*\d+/i)) {
            episodes.push({ url: resolveUrl(epM[1], resolvedUrl), title: t });
          }
        }
      }

      if (episodes.length === 0) {
        var articleRegex = /<article[\s\S]*?<\/article\s*>/gi;
        var artM;
        while ((artM = articleRegex.exec(pageHtml)) !== null) {
          var aM = artM[0].match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
          if (aM && aM[1]) {
            var artTitle = htmlText(aM[2]).trim();
            if (artTitle) {
              episodes.push({ url: resolveUrl(aM[1], resolvedUrl), title: artTitle });
            }
          }
        }
      }

      return episodes;
    }).catch(function() { return []; });
  }).catch(function() { return []; });
}

function buildSeriesEpisodes(detailUrl, html) {
  var buttons = [];

  var btnRegex = /<a[^>]*class="[^"]*(?:maxbutton-download-links|dl|btnn)[^"]*"[^>]*href="([^"]*)"[^>]*>/gi;
  var m;
  while ((m = btnRegex.exec(html)) !== null) {
    if (m[1] && m[1].indexOf('#') !== 0) {
      buttons.push(m[1]);
    }
  }

  if (buttons.length === 0) {
    var hRegex = /<h[34][^>]*>([\s\S]*?)<\/h[34]>\s*(<[\s\S]*?)(?=<h[34][^>]*>|<!--|<\/div>\s*<\/div>|$)/gi;
    var hM;
    while ((hM = hRegex.exec(html)) !== null) {
      var heading = htmlText(hM[1]).toLowerCase();
      if (heading.match(/season/i) && heading.match(/\d{3,4}p/i) && heading.indexOf('download') === -1) {
        var section = hM[2];
        var aM = section.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
        if (aM && aM[1] && aM[1].indexOf('#') !== 0) {
          buttons.push(aM[1]);
        }
      }
    }
  }

  if (buttons.length === 0) {
    var allBtnLinks = html.match(/<a[^>]*href="(https?:\/\/[^"]*(?:sidexfee|gdflix|fastdlserver|gdlink)[^"]*)"[^>]*>/gi);
    if (allBtnLinks) {
      for (var i = 0; i < allBtnLinks.length; i++) {
        var lM = allBtnLinks[i].match(/href="([^"]*)"/i);
        if (lM) buttons.push(lM[1]);
      }
    }
  }

  var uniqueButtons = [];
  var seen = {};
  for (var i = 0; i < buttons.length; i++) {
    var resolved = resolveUrl(buttons[i], detailUrl);
    if (!seen[resolved]) {
      seen[resolved] = true;
      uniqueButtons.push(resolved);
    }
  }

  if (uniqueButtons.length === 0) {
    return Promise.resolve([]);
  }

  var buttonPromises = uniqueButtons.slice(0, 5).map(function(btnUrl) {
    return resolveButtonToEpisodes(btnUrl).catch(function() { return []; });
  });

  return Promise.all(buttonPromises).then(function(allEpisodes) {
    var episodes = [];
    var num = 1;
    var seenTitles = {};
    var seenUrls = {};

    for (var i = 0; i < allEpisodes.length; i++) {
      for (var j = 0; j < allEpisodes[i].length; j++) {
        var ep = allEpisodes[i][j];
        var epTitle = ep.title || ('Episode ' + num);

        if (seenUrls[ep.url]) continue;
        seenUrls[ep.url] = true;

        var dedupKey = epTitle.toLowerCase().replace(/\s+/g, '');
        if (seenTitles[dedupKey]) continue;
        seenTitles[dedupKey] = true;

        var epNumMatch = epTitle.match(/episode\s*(\d+)/i);
        var epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : num;

        var epUrl = 'bflix://' + JSON.stringify([{ url: ep.url }]);
        episodes.push({
          id: epUrl,
          number: epNum,
          title: epTitle,
          url: epUrl
        });
        num++;
      }
    }

    episodes.sort(function(a, b) { return a.number - b.number; });

    for (var i = 0; i < episodes.length; i++) {
      episodes[i].number = i + 1;
    }

    return episodes;
  });
}

function buildEpisodes(detailUrl, html, isSeries) {
  if (isSeries) {
    return buildSeriesEpisodes(detailUrl, html);
  }
  return Promise.resolve(buildMovieEpisodes(html, detailUrl));
}

function getDetail(url, opts) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) {
    var html = r.body;

    var titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var rawTitle = titleM ? htmlText(titleM[1]).replace(/\s*[-|\u2013\u2014].*/i, '').trim() : '';

    var pM = html.match(/property="og:image"[^>]*content="([^"]*)"/i) ||
             html.match(/content="([^"]*)"[^>]*property="og:image"/i) ||
             html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*\/?\s*>/i);
    var cover = pM ? pM[1] : '';

    var dM = html.match(/<span[^>]*id="summary"[^>]*>([\s\S]*?)<\/span>/i) ||
             html.match(/<div[^>]*id="summary"[^>]*>([\s\S]*?)<\/div>/i);
    var description = dM ? htmlText(dM[1]).trim() : '';

    var imdbId = extractImdbId(html);

    var isSeries = isSeriesPage(html, url);
    var mediaType = isSeries ? 'series' : 'movie';

    var genres = extractGenres(html);

    return fetchCinemeta(imdbId, mediaType).then(function(meta) {
      var finalTitle = (meta && meta.name) ? meta.name : rawTitle;
      var finalCover = cover || (meta && meta.poster) || '';
      var finalDesc = description || (meta && meta.description) || '';
      var year = null;
      if (meta && meta.year) {
        var yStr = String(meta.year);
        year = parseInt(yStr.split('-')[0].split('\u2013')[0], 10);
      }
      if (!year) {
        var yearM = html.match(/\b((?:19|20)\d{2})\b/);
        if (yearM) year = parseInt(yearM[1], 10);
      }
      var finalGenres = genres.length > 0 ? genres : (meta && meta.genre) || [];
      var status = (meta && meta.status) || '';

      return buildEpisodes(url, html, isSeries).then(function(episodes) {
        return {
          id: url,
          title: finalTitle,
          cover: finalCover,
          url: url,
          description: finalDesc,
          status: status,
          genres: finalGenres,
          studios: [],
          type: mediaType,
          sourceId: SOURCE_ID,
          episodes: episodes,
          year: year,
          subCount: 0,
          dubCount: 0
        };
      });
    });
  });
}

function getEpisodes(url, opts) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) {
    var html = r.body;
    var isSeries = isSeriesPage(html, url);
    return buildEpisodes(url, html, isSeries);
  });
}

function resolveDownloadLink(url) {
  return maybeBypass(url).then(function(resolvedUrl) {
    if (!resolvedUrl) return [];

    if (resolvedUrl.indexOf('gdflix') > -1 || resolvedUrl.indexOf('gdlink') > -1) {
      return extractGDFlix(resolvedUrl);
    }
    if (resolvedUrl.indexOf('fastdlserver') > -1) {
      return resolveFastDl(resolvedUrl);
    }
    if (resolvedUrl.indexOf('hubcloud') > -1 || resolvedUrl.indexOf('vcloud') > -1) {
      return extractHubCloud(resolvedUrl);
    }

    var quality = extractQuality(resolvedUrl);
    return [{
      url: resolvedUrl,
      quality: quality,
      container: 'mp4',
      headers: { 'User-Agent': UA },
      kind: 'sub',
      audioLang: '',
      subtitles: []
    }];
  }).catch(function() { return []; });
}

function getVideoSources(episodeUrl, opts) {
  if (!episodeUrl || episodeUrl.indexOf('bflix://') !== 0) return Promise.resolve([]);

  var links;
  try {
    links = JSON.parse(episodeUrl.substring(8));
  } catch (e) {
    return Promise.resolve([]);
  }

  if (!links || !links.length) return Promise.resolve([]);

  var sourcePromises = links.map(function(link) {
    return resolveDownloadLink(link.url);
  });

  return Promise.all(sourcePromises).then(function(all) {
    var result = [];
    for (var i = 0; i < all.length; i++) {
      for (var j = 0; j < all[i].length; j++) {
        result.push(all[i][j]);
      }
    }
    return result;
  });
}

function extractGDFlix(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) {
    var html = r.body;

    var fileName = '';
    var nameM = html.match(/<li[^>]*class="[^"]*list-group-item[^"]*"[^>]*>[\s\S]*?(?:Name|File\s*Name)[\s\S]*?:[\s\S]*?<strong>([\s\S]*?)<\/strong>/i) ||
                html.match(/<li[^>]*class="[^"]*list-group-item[^"]*"[^>]*>[\s\S]*?(?:Name|File\s*Name)[\s\S]*?:[\s\S]*?<b>([\s\S]*?)<\/b>/i) ||
                html.match(/>(?:Name|File\s*Name)\s*:?\s*<\/[^>]*>\s*<[^>]*>([\s\S]*?)<\//i);
    if (nameM) fileName = htmlText(nameM[1]).trim();

    var fileSize = '';
    var sizeM = html.match(/<li[^>]*class="[^"]*list-group-item[^"]*"[^>]*>[\s\S]*?Size[\s\S]*?:[\s\S]*?<strong>([\s\S]*?)<\/strong>/i) ||
                html.match(/<li[^>]*class="[^"]*list-group-item[^"]*"[^>]*>[\s\S]*?Size[\s\S]*?:[\s\S]*?<b>([\s\S]*?)<\/b>/i) ||
                html.match(/>Size\s*:?\s*<\/[^>]*>\s*<[^>]*>([\s\S]*?)<\//i);
    if (sizeM) fileSize = htmlText(sizeM[1]).trim();

    var quality = extractQuality(fileName) || extractQuality(url);
    var sources = [];

    var linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    var linkM;
    while ((linkM = linkRegex.exec(html)) !== null) {
      var href = linkM[1];
      var linkText = htmlText(linkM[2]).trim().toLowerCase();

      if (!href || href === '#' || href === '/' || href.indexOf('javascript') === 0) continue;
      if (href.indexOf('http') !== 0) continue;

      var isServer = linkText.indexOf('direct') > -1 ||
                     linkText.indexOf('fsl') > -1 ||
                     linkText.indexOf('instant') > -1 ||
                     linkText.indexOf('cloud') > -1 ||
                     linkText.indexOf('gofile') > -1 ||
                     linkText.indexOf('pixeldrain') > -1 ||
                     linkText.indexOf('download') > -1 ||
                     linkText.indexOf('server') > -1;

      if (isServer) {
        var serverQuality = quality || extractQuality(linkText);

        if (linkText.indexOf('pixeldrain') > -1 && href.indexOf('pixeldrain') === -1) {
          // skip if text says pixeldrain but url doesn't match
        } else if (linkText.indexOf('fast cloud') > -1) {
          sources.push({ url: href, quality: serverQuality, _type: 'fastcloud' });
        } else if (linkText.indexOf('instant') > -1) {
          sources.push({ url: href, quality: serverQuality, _type: 'instant' });
        } else {
          sources.push({
            url: href,
            quality: serverQuality,
            container: 'mp4',
            headers: { 'User-Agent': UA, 'Referer': url },
            kind: 'sub',
            audioLang: '',
            subtitles: []
          });
        }
      }
    }

    if (sources.length === 0) {
      var dlRegex = /href="(https?:\/\/[^"]*\.(?:mkv|mp4|avi|webm)[^"]*)"/gi;
      var dlM;
      while ((dlM = dlRegex.exec(html)) !== null) {
        sources.push({
          url: dlM[1],
          quality: quality || extractQuality(dlM[1]),
          container: 'mp4',
          headers: { 'User-Agent': UA, 'Referer': url },
          kind: 'sub',
          audioLang: '',
          subtitles: []
        });
      }
    }

    if (sources.length === 0) {
      var redirectRegex = /href="(https?:\/\/[^"]*(?:gdflix|gdlink|hubcloud|driveleech|driveseed)[^"]*)"/gi;
      var redM;
      while ((redM = redirectRegex.exec(html)) !== null) {
        sources.push({
          url: redM[1],
          quality: quality,
          container: 'mp4',
          headers: { 'User-Agent': UA, 'Referer': url },
          kind: 'sub',
          audioLang: '',
          subtitles: []
        });
      }
    }

    var deferredPromises = [];
    var finalSources = [];

    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      if (src._type === 'fastcloud') {
        deferredPromises.push(resolveFastCloud(src.url, src.quality, url));
      } else if (src._type === 'instant') {
        deferredPromises.push(resolveInstantDl(src.url, src.quality, url));
      } else {
        finalSources.push(src);
      }
    }

    if (deferredPromises.length === 0) return finalSources;

    return Promise.all(deferredPromises.map(function(p) { return p.catch(function() { return []; }); }))
      .then(function(resolved) {
        for (var i = 0; i < resolved.length; i++) {
          for (var j = 0; j < resolved[i].length; j++) {
            finalSources.push(resolved[i][j]);
          }
        }
        return finalSources;
      });
  }).catch(function() { return []; });
}

function resolveFastCloud(url, quality, referer) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': referer } }).then(function(r) {
    var html = r.body;
    var sources = [];

    var dlRegex = /href="(https?:\/\/[^"]*\.(?:mkv|mp4|avi|webm)[^"]*)"/gi;
    var m;
    while ((m = dlRegex.exec(html)) !== null) {
      sources.push({
        url: m[1],
        quality: quality || extractQuality(m[1]),
        container: 'mp4',
        headers: { 'User-Agent': UA, 'Referer': url },
        kind: 'sub',
        audioLang: '',
        subtitles: []
      });
    }

    if (sources.length === 0) {
      var linkRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi;
      var lM;
      while ((lM = linkRegex.exec(html)) !== null) {
        var href = lM[1];
        if (href.indexOf('.css') === -1 && href.indexOf('.js') === -1 && href.indexOf('.png') === -1) {
          sources.push({
            url: href,
            quality: quality,
            container: 'mp4',
            headers: { 'User-Agent': UA, 'Referer': url },
            kind: 'sub',
            audioLang: '',
            subtitles: []
          });
        }
      }
    }

    return sources;
  }).catch(function() { return []; });
}

function resolveInstantDl(url, quality, referer) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': referer } }).then(function(r) {
    var location = '';
    if (r.headers) {
      location = r.headers.Location || r.headers.location || '';
    }
    if (location) {
      return [{
        url: location,
        quality: quality,
        container: 'mp4',
        headers: { 'User-Agent': UA },
        kind: 'sub',
        audioLang: '',
        subtitles: []
      }];
    }

    var html = r.body;
    var m = html.match(/location\.(?:replace|href)\s*[=(]\s*['"]([^'"]+)['"]/i);
    if (m) {
      return [{
        url: m[1],
        quality: quality,
        container: 'mp4',
        headers: { 'User-Agent': UA },
        kind: 'sub',
        audioLang: '',
        subtitles: []
      }];
    }

    return [{
      url: url,
      quality: quality,
      container: 'mp4',
      headers: { 'User-Agent': UA, 'Referer': referer },
      kind: 'sub',
      audioLang: '',
      subtitles: []
    }];
  }).catch(function() { return []; });
}

function resolveFastDl(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) {
    var location = '';
    if (r.headers) {
      location = r.headers.Location || r.headers.location || '';
    }

    if (location) {
      return [{
        url: location,
        quality: extractQuality(location),
        container: 'mp4',
        headers: { 'User-Agent': UA },
        kind: 'sub',
        audioLang: '',
        subtitles: []
      }];
    }

    var html = r.body;
    var m = html.match(/location\.(?:replace|href)\s*[=(]\s*['"]([^'"]+)['"]/i);
    if (m) {
      return [{
        url: m[1],
        quality: extractQuality(m[1]),
        container: 'mp4',
        headers: { 'User-Agent': UA },
        kind: 'sub',
        audioLang: '',
        subtitles: []
      }];
    }

    var fileRegex = /href="(https?:\/\/[^"]*\.(?:mkv|mp4|avi|webm)[^"]*)"/i;
    var fM = html.match(fileRegex);
    if (fM) {
      return [{
        url: fM[1],
        quality: extractQuality(fM[1]),
        container: 'mp4',
        headers: { 'User-Agent': UA },
        kind: 'sub',
        audioLang: '',
        subtitles: []
      }];
    }

    return [{
      url: url,
      quality: 'auto',
      container: 'mp4',
      headers: { 'User-Agent': UA },
      kind: 'sub',
      audioLang: '',
      subtitles: []
    }];
  }).catch(function() { return []; });
}

function extractHubCloud(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) {
    var html = r.body;
    var sources = [];

    var dlRegex = /href="(https?:\/\/[^"]*\.(?:mkv|mp4|avi|webm)[^"]*)"/gi;
    var m;
    while ((m = dlRegex.exec(html)) !== null) {
      sources.push({
        url: m[1],
        quality: extractQuality(m[1]),
        container: 'mp4',
        headers: { 'User-Agent': UA, 'Referer': url },
        kind: 'sub',
        audioLang: '',
        subtitles: []
      });
    }

    if (sources.length === 0) {
      var linkRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?<\/a>/gi;
      var lM;
      while ((lM = linkRegex.exec(html)) !== null) {
        var href = lM[1];
        if (href.indexOf('gdflix') > -1 || href.indexOf('gdlink') > -1 || href.indexOf('fastdlserver') > -1) {
          sources.push({
            url: href,
            quality: 'auto',
            container: 'mp4',
            headers: { 'User-Agent': UA, 'Referer': url },
            kind: 'sub',
            audioLang: '',
            subtitles: []
          });
        }
      }
    }

    return sources;
  }).catch(function() { return []; });
}

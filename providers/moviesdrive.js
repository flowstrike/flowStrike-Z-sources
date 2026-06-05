var SOURCE_ID = 'moviesdrive';
var URLS_JSON_URL = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
var AIOMETA_URL = 'https://aiometadata.elfhosted.com/stremio/9197a4a9-2f5b-4911-845e-8704c520bdf7';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

var _dom = null;

function _domains() {
  if (_dom) return Promise.resolve(_dom);
  return fetch(URLS_JSON_URL, { headers: { 'User-Agent': UA } }).then(function(r) {
    var j = {};
    try { j = JSON.parse(r.body || '{}'); } catch(e) {}
    _dom = {
      main: (j.moviesdrive || 'https://new3.moviesdrives.my').replace(/\/$/, ''),
      hub: (j.hubcloud || 'https://hubcloud.foo').replace(/\/$/, ''),
      gdflix: (j.gdflix || 'https://new18.gdflix.net').replace(/\/$/, '')
    };
    return _dom;
  }).catch(function() {
    _dom = { main: 'https://new3.moviesdrives.my', hub: 'https://hubcloud.foo', gdflix: 'https://new18.gdflix.net' };
    return _dom;
  });
}

function _get(url, ref) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': ref || url } })
    .then(function(r) { return r.body || ''; })
    .catch(function() { return ''; });
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

function cleanTitle(t) {
  if (!t) return '';
  return htmlText(t).replace(/^Download\s+/i, '').trim();
}

function extractImdbId(href) {
  if (!href) return '';
  var m = String(href).match(/title\/(tt\d+)/i);
  return m ? m[1] : '';
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function parseCards(html, base) {
  var results = [];
  var cardRegex = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
  var m;
  while ((m = cardRegex.exec(html)) !== null) {
    var title = cleanTitle(m[3]);
    if (!title) continue;
    results.push({
      id: absUrl(m[1], base),
      title: title,
      cover: absUrl(m[2], base),
      url: absUrl(m[1], base),
      type: 'movie',
      sourceId: SOURCE_ID
    });
  }
  return results;
}

function fetchAiometa(imdbId, mediaType) {
  if (!imdbId) return Promise.resolve(null);
  return _get(AIOMETA_URL + '/meta/' + mediaType + '/' + imdbId + '.json')
    .then(function(body) {
      try { return JSON.parse(body).meta || null; }
      catch(e) { return null; }
    })
    .catch(function() { return null; });
}

function getInfo() {
  return {
    name: 'MoviesDrive',
    lang: 'hi',
    baseUrl: 'https://new3.moviesdrives.my',
    logo: '',
    type: 'movie',
    version: '1.0.0'
  };
}

function search(query, page, opts) {
  return _domains().then(function(dom) {
    var p = page || 1;
    var url = dom.main + '/search.php?q=' + encodeURIComponent(query) + '&page=' + p;
    return _get(url).then(function(body) {
      var data;
      try { data = JSON.parse(body); } catch(e) { return []; }
      var hits = data.hits || [];
      var results = [];
      for (var i = 0; i < hits.length; i++) {
        var doc = hits[i].document || {};
        var title = cleanTitle(doc.post_title || '');
        if (!title) continue;
        results.push({
          id: dom.main + (doc.permalink || ''),
          title: title,
          cover: doc.post_thumbnail || '',
          url: dom.main + (doc.permalink || ''),
          type: 'movie',
          sourceId: SOURCE_ID
        });
      }
      return results;
    });
  });
}

function getHome(opts) {
  return _domains().then(function(dom) {
    var cats = [
      { title: 'Home', path: '/page/1' },
      { title: 'Prime Video', path: '/category/amzn-prime-video/page/1' },
      { title: 'Netflix', path: '/category/netflix/page/1' },
      { title: 'Hotstar', path: '/category/hotstar/page/1' },
      { title: 'Anime', path: '/category/anime/page/1' },
      { title: 'K-Drama', path: '/category/k-drama/page/1' }
    ];
    var promises = cats.map(function(cat) {
      return _get(dom.main + cat.path).then(function(html) {
        return { title: cat.title, items: parseCards(html, dom.main) };
      }).catch(function() {
        return { title: cat.title, items: [] };
      });
    });
    return Promise.all(promises);
  });
}

function buildSeriesEpisodes(html, mainUrl) {
  var h5Regex = /<h5[^>]*>[\s\S]*?<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var seasonButtons = [];
  var hm;
  while ((hm = h5Regex.exec(html)) !== null) {
    var btnText = htmlText(hm[2]).trim();
    if (/zip/i.test(btnText)) continue;
    seasonButtons.push({ href: hm[1], text: btnText });
  }

  if (seasonButtons.length === 0) return Promise.resolve([]);

  var h5Blocks = html.split(/<h5[^>]*>/i);
  var seasonNums = {};
  var currentSeason = 1;
  for (var bi = 0; bi < h5Blocks.length; bi++) {
    var block = h5Blocks[bi];
    var seasonTextMatch = block.match(/(Season\s*\d+|S\d{2})/i);
    if (seasonTextMatch) {
      var snMatch = seasonTextMatch[1].match(/(\d+)/);
      if (snMatch) currentSeason = parseInt(snMatch[1]);
    }
    var linkMatch = block.match(/<a[^>]+href\s*=\s*["']([^"']+)["']/i);
    if (linkMatch) seasonNums[linkMatch[1]] = currentSeason;
  }

  var promises = seasonButtons.map(function(btn, idx) {
    var sNum = seasonNums[btn.href] || (idx + 1);
    var fullUrl = absUrl(btn.href, mainUrl);

    return _get(fullUrl).then(function(epHtml) {
      var links = [];
      var aRegex = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var am;
      while ((am = aRegex.exec(epHtml)) !== null) {
        if (/hubcloud|gdflix|gdlink/i.test(am[1]) || /hubcloud|gdflix|gdlink/i.test(htmlText(am[2]))) {
          links.push(am[1]);
        }
      }
      if (links.length === 0) {
        var hcRegex = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?(?:HubCloud|GDFlix|GdLink)[\s\S]*?<\/a>/gi;
        var hcm;
        while ((hcm = hcRegex.exec(epHtml)) !== null) {
          links.push(hcm[1]);
        }
      }
      return { season: sNum, text: btn.text, links: links };
    }).catch(function() {
      return { season: sNum, text: btn.text, links: [] };
    });
  });

  return Promise.all(promises).then(function(seasons) {
    var episodes = [];
    for (var i = 0; i < seasons.length; i++) {
      var s = seasons[i];
      if (s.links.length === 0) continue;
      var epUrl = 'mdrive://' + encodeURIComponent(JSON.stringify(s.links));
      episodes.push({
        id: epUrl,
        number: i + 1,
        title: s.text || ('Season ' + s.season),
        url: epUrl
      });
    }
    return episodes;
  });
}

function buildMovieEpisodes(html, mainUrl) {
  var h5Links = [];
  var h5Regex = /<h5[^>]*>[\s\S]*?<a[^>]+href\s*=\s*["']([^"']+)["']/gi;
  var mm;
  while ((mm = h5Regex.exec(html)) !== null) {
    var raw = mm[0].replace(/<[^>]+>/g, '');
    if (/zip/i.test(raw)) continue;
    h5Links.push(mm[1]);
  }

  if (h5Links.length === 0) {
    var directRegex = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?(?:HubCloud|GDFlix|GdLink)[\s\S]*?<\/a>/gi;
    var dm;
    while ((dm = directRegex.exec(html)) !== null) {
      h5Links.push(dm[1]);
    }
  }

  if (h5Links.length === 0) {
    return Promise.resolve([{
      id: 'mdrive://[]',
      number: 1,
      title: 'Full Movie',
      url: 'mdrive://[]'
    }]);
  }

  var promises = h5Links.map(function(href) {
    var fullUrl = absUrl(href, mainUrl);
    return _get(fullUrl).then(function(pageHtml) {
      var links = [];
      var aRegex = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi;
      var am;
      while ((am = aRegex.exec(pageHtml)) !== null) {
        if (/hubcloud|gdflix|gdlink/i.test(am[1])) {
          links.push(am[1]);
        }
      }
      return links;
    }).catch(function() { return []; });
  });

  return Promise.all(promises).then(function(allLinks) {
    var merged = [];
    for (var i = 0; i < allLinks.length; i++) {
      for (var j = 0; j < allLinks[i].length; j++) {
        merged.push(allLinks[i][j]);
      }
    }
    var unique = [];
    var seen = {};
    for (var i = 0; i < merged.length; i++) {
      if (!seen[merged[i]]) {
        seen[merged[i]] = true;
        unique.push(merged[i]);
      }
    }
    if (unique.length === 0) {
      return [{
        id: 'mdrive://[]',
        number: 1,
        title: 'Full Movie',
        url: 'mdrive://[]'
      }];
    }
    var epUrl = 'mdrive://' + encodeURIComponent(JSON.stringify(unique));
    return [{
      id: epUrl,
      number: 1,
      title: 'Full Movie',
      url: epUrl
    }];
  });
}

function getDetail(url, opts) {
  return _domains().then(function(dom) {
    return _get(url).then(function(html) {
      var title = '';
      var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) title = cleanTitle(titleMatch[1]);

      var poster = '';
      var posterMatch = html.match(/<main[^>]*>[\s\S]*?<p[^>]*>[\s\S]*?<img[^>]+src\s*=\s*["']([^"']+)["']/i);
      if (posterMatch) poster = posterMatch[1];

      var imdbId = '';
      var imdbMatch = html.match(/<a[^>]+href\s*=\s*["']([^"']*imdb[^"']*)["']/i);
      if (imdbMatch) imdbId = extractImdbId(imdbMatch[1]);

      var isSeries = /episode|season|series/i.test(title);
      var mediaType = isSeries ? 'series' : 'movie';

      var yearFromTitle = title.match(/\b((?:19|20)\d{2})\b/);
      var fallbackYear = yearFromTitle ? parseInt(yearFromTitle[1], 10) : null;

      return fetchAiometa(imdbId, mediaType).then(function(meta) {
        var finalTitle = (meta && meta.name) ? meta.name : title;
        var finalCover = poster || (meta && meta.poster) || '';
        var finalDesc = (meta && meta.description) || '';
        var year = meta && meta.year ? parseInt(String(meta.year).split('-')[0].split('\u2013')[0], 10) : fallbackYear;

        var episodesFn = isSeries ? buildSeriesEpisodes : buildMovieEpisodes;
        return episodesFn(html, dom.main).then(function(episodes) {
          return {
            id: url,
            title: finalTitle,
            cover: finalCover,
            url: url,
            description: finalDesc,
            status: 'unknown',
            genres: [],
            studios: [],
            type: 'movie',
            sourceId: SOURCE_ID,
            episodes: episodes,
            year: year,
            subCount: 0,
            dubCount: 0
          };
        });
      });
    });
  });
}

function getEpisodes(url, opts) {
  if (url.indexOf('mdrive://') === 0) {
    var encoded = url.substring('mdrive://'.length);
    var hrefs;
    try {
      hrefs = JSON.parse(decodeURIComponent(encoded));
    } catch(e) {
      return Promise.resolve([]);
    }
    return Promise.resolve(hrefs.map(function(h, i) {
      return { id: h, number: i + 1, title: 'Source ' + (i + 1), url: h };
    }));
  }
  return Promise.resolve([{ id: url, number: 1, title: 'Source 1', url: url }]);
}

function extractHubcloudSources(url) {
  return _domains().then(function(dom) {
    return _get(url).then(function(html) {
      var videoUrl = null;

      if (url.indexOf('/video/') >= 0) {
        var centerMatch = html.match(/<div[^>]*class\s*=\s*["'][^"']*vd[^"']*["'][^>]*>[\s\S]*?<center[^>]*>[\s\S]*?<a[^>]+href\s*=\s*["']([^"']+)["']/i);
        if (centerMatch) videoUrl = centerMatch[1];
      }

      if (!videoUrl) {
        var varMatch = html.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
        if (varMatch) videoUrl = varMatch[1];
      }

      if (!videoUrl) return [];

      if (videoUrl.indexOf('http') !== 0) {
        videoUrl = dom.hub + (videoUrl.charAt(0) === '/' ? '' : '/') + videoUrl;
      }

      return _get(videoUrl).then(function(dlHtml) {
        var filename = '';
        var fnMatch = dlHtml.match(/card-header[^>]*>([\s\S]*?)<\/div>/i);
        if (fnMatch) filename = fnMatch[1].replace(/<[^>]+>/g, '').trim();

        var quality = extractQuality(filename) || extractQuality(url);

        var btnRegex = /<h2[^>]*>[\s\S]*?<a[^>]+class\s*=\s*["'][^"']*btn[^"']*["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var servers = [];
        var bm;
        while ((bm = btnRegex.exec(dlHtml)) !== null) {
          servers.push({ href: bm[1], text: bm[2].replace(/<[^>]+>/g, '').trim() });
        }

        var serverPromises = servers.map(function(server) {
          var serverName = server.text.toLowerCase();
          var dlBase = videoUrl.match(/^(https?:\/\/[^\/]+)/);
          dlBase = dlBase ? dlBase[1] : dom.hub;
          var serverHref = absUrl(server.href, dlBase);

          if (serverName.indexOf('fsl') >= 0 || serverName.indexOf('mega') >= 0 || serverName.indexOf('download file') >= 0) {
            return Promise.resolve({
              url: serverHref,
              quality: quality,
              container: 'mp4',
              headers: { 'User-Agent': UA, 'Referer': videoUrl },
              kind: 'sub',
              audioLang: '',
              subtitles: []
            });
          }

          if (serverName.indexOf('buzz') >= 0) {
            return _get(serverHref).then(function(buzzHtml) {
              var hxMatch = buzzHtml.match(/hx-redirect\s*=\s*["']([^"']+)["']/i);
              if (hxMatch) {
                return {
                  url: hxMatch[1],
                  quality: quality,
                  container: 'mp4',
                  headers: { 'User-Agent': UA },
                  kind: 'sub',
                  audioLang: '',
                  subtitles: []
                };
              }
              return null;
            }).catch(function() { return null; });
          }

          if (serverName.indexOf('pixeldrain') >= 0 || serverName.indexOf('10gbps') >= 0) {
            return Promise.resolve({
              url: serverHref,
              quality: quality,
              container: 'mp4',
              headers: { 'User-Agent': UA, 'Referer': videoUrl },
              kind: 'sub',
              audioLang: '',
              subtitles: []
            });
          }

          return Promise.resolve(null);
        });

        return Promise.all(serverPromises).then(function(results) {
          var sources = [];
          for (var i = 0; i < results.length; i++) {
            if (results[i]) sources.push(results[i]);
          }
          return sources;
        });
      });
    });
  }).catch(function() { return []; });
}

function extractGdflixSources(url) {
  return _get(url).then(function(html) {
    var filename = '';
    var size = '';
    var liRegex = /<li[^>]*class\s*=\s*["'][^"']*list-group-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
    var lm;
    while ((lm = liRegex.exec(html)) !== null) {
      var liText = lm[1].replace(/<[^>]+>/g, '').trim();
      if (/name/i.test(liText)) filename = liText.replace(/^.*?(name[:\s]*)/i, '').trim();
      if (/size/i.test(liText)) size = liText.replace(/^.*?(size[:\s]*)/i, '').trim();
    }

    var quality = extractQuality(filename) || extractQuality(url);
    var sources = [];

    var btnRegex = /<div[^>]*class\s*=\s*["'][^"']*text-center[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    var btnBlock;
    var servers = [];
    while ((btnBlock = btnRegex.exec(html)) !== null) {
      var aRegex = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var am;
      while ((am = aRegex.exec(btnBlock[1])) !== null) {
        servers.push({ href: am[1], text: am[2].replace(/<[^>]+>/g, '').trim() });
      }
    }

    var baseUrl = url.match(/^(https?:\/\/[^\/]+)/);
    baseUrl = baseUrl ? baseUrl[1] : '';

    var serverPromises = servers.map(function(server) {
      var serverName = server.text.toLowerCase();
      var serverHref = absUrl(server.href, baseUrl);

      if (serverName.indexOf('fsl') >= 0 || serverName.indexOf('direct') >= 0 || serverName.indexOf('cloud download') >= 0) {
        return Promise.resolve({
          url: serverHref,
          quality: quality,
          container: 'mp4',
          headers: { 'User-Agent': UA, 'Referer': url },
          kind: 'sub',
          audioLang: '',
          subtitles: []
        });
      }

      if (serverName.indexOf('fast cloud') >= 0) {
        return _get(serverHref).then(function(redirHtml) {
          var redirMatch = redirHtml.match(/<meta[^>]*http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'][^"']*url=([^"']+)/i);
          if (!redirMatch) {
            var locMatch = redirHtml.match(/window\.location(?:\.replace)?\s*\(\s*["']([^"']+)["']/);
            if (locMatch) redirMatch = [null, locMatch[1]];
          }
          if (redirMatch) {
            return {
              url: absUrl(redirMatch[1], baseUrl),
              quality: quality,
              container: 'mp4',
              headers: { 'User-Agent': UA },
              kind: 'sub',
              audioLang: '',
              subtitles: []
            };
          }
          return null;
        }).catch(function() { return null; });
      }

      if (serverName.indexOf('pixeldrain') >= 0 || serverName.indexOf('instant') >= 0) {
        return Promise.resolve({
          url: serverHref,
          quality: quality,
          container: 'mp4',
          headers: { 'User-Agent': UA, 'Referer': url },
          kind: 'sub',
          audioLang: '',
          subtitles: []
        });
      }

      return Promise.resolve(null);
    });

    return Promise.all(serverPromises).then(function(results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i]) sources.push(results[i]);
      }
      return sources;
    });
  }).catch(function() { return []; });
}

function getVideoSources(episodeUrl, opts) {
  if (!episodeUrl) return Promise.resolve([]);

  var links;
  if (episodeUrl.indexOf('mdrive://') === 0) {
    try {
      links = JSON.parse(decodeURIComponent(episodeUrl.substring('mdrive://'.length)));
    } catch(e) {
      return Promise.resolve([]);
    }
  } else {
    links = [episodeUrl];
  }

  if (!links || links.length === 0) return Promise.resolve([]);

  var promises = links.map(function(link) {
    if (/hubcloud|vcloud/i.test(link)) {
      return extractHubcloudSources(link);
    }
    if (/gdflix|gdlink/i.test(link)) {
      return extractGdflixSources(link);
    }
    return Promise.resolve([]);
  });

  return Promise.all(promises).then(function(all) {
    var result = [];
    for (var i = 0; i < all.length; i++) {
      for (var j = 0; j < all[i].length; j++) {
        result.push(all[i][j]);
      }
    }
    return result;
  });
}

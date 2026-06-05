var VEGA = (function () {
  var URLS_JSON =
    "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
  var CINEMETA = "https://v3-cinemeta.strem.io/meta";
  var FALLBACK_MAIN = "https://vegamovies.mq";

  var mainUrl = FALLBACK_MAIN;
  var hubcloudUrl = "";

  function tryParseJson(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  function resolveUrl(href, base) {
    return absUrl(href, base);
  }

  function fixUrl(href, base) {
    if (!href) return "";
    if (href.indexOf("http") === 0) return href;
    if (href.indexOf("//") === 0) return "https:" + href;
    if (href.charAt(0) === "/") return base + href;
    return base + "/" + href;
  }

  function stripPrefix(title) {
    return title.replace(/^Download\s+/i, "").trim();
  }

  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function initDomain() {
    return fetch(URLS_JSON)
      .then(function (r) {
        if (!r.ok) return;
        return tryParseJson(r.body);
      })
      .then(function (obj) {
        if (obj) {
          if (obj.vegamovies) mainUrl = obj.vegamovies.replace(/\/+$/, "");
          if (obj.hubcloud) hubcloudUrl = obj.hubcloud.replace(/\/+$/, "");
        }
      })
      .catch(function () {});
  }

  function getInfo() {
    return {
      name: "VegaMovies",
      lang: "hi",
      baseUrl: mainUrl,
      logo: mainUrl + "/wp-content/uploads/2023/04/vegamovies.svg",
      type: "movie",
      version: "2.0.0",
    };
  }

  function search(query, page, opts) {
    var pg = page || 1;
    var url = mainUrl + "/search.php?q=" + encodeURIComponent(query) + "&page=" + pg;
    return fetch(url)
      .then(function (r) {
        var data = tryParseJson(r.body);
        if (!data || !data.hits) return [];
        return data.hits.map(function (hit) {
          var doc = hit.document;
          var title = stripPrefix(doc.post_title || "");
          var href = fixUrl(doc.permalink, mainUrl);
          var poster = doc.post_thumbnail || "";
          return {
            id: href,
            title: title,
            cover: poster,
            url: href,
            type: "movie",
            sourceId: "vegamovies",
          };
        });
      })
      .catch(function () {
        return [];
      });
  }

  function parseCards(html) {
    var results = [];
    var gridRe = /<div[^>]*class=["'][^"']*movies-grid[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["'](?:pagination|clearfix))/i;
    var gridMatch = html.match(gridRe);
    var block = gridMatch ? gridMatch[1] : html;
    var cardRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = cardRe.exec(block)) !== null) {
      var href = m[1];
      var inner = m[2];
      var imgRe = /<img[^>]+(?:alt|title)=["']([^"']*)["'][^>]*(?:src|data-src)=["']([^"']*)["'][^>]*>/i;
      if (!inner.match(imgRe)) {
        imgRe = /<img[^>]+(?:src|data-src)=["']([^"']*)["'][^>]+(?:alt|title)=["']([^"']*)["'][^>]*>/i;
        var im = inner.match(imgRe);
        if (im) {
          results.push({
            id: fixUrl(href, mainUrl),
            title: stripPrefix(im[2]),
            cover: im[1],
            url: fixUrl(href, mainUrl),
            type: "movie",
            sourceId: "vegamovies",
          });
        }
      } else {
        var im2 = inner.match(imgRe);
        if (im2) {
          results.push({
            id: fixUrl(href, mainUrl),
            title: stripPrefix(im2[1]),
            cover: im2[2],
            url: fixUrl(href, mainUrl),
            type: "movie",
            sourceId: "vegamovies",
          });
        }
      }
    }
    return results;
  }

  function getHome(opts) {
    var sections = [
      { title: "Latest Movies", url: mainUrl + "/page/%d/" },
      { title: "Netflix", url: mainUrl + "/category/web-series/netflix/page/%d/" },
      { title: "Amazon Prime", url: mainUrl + "/category/web-series/amazon-prime/page/%d/" },
      { title: "Disney+", url: mainUrl + "/category/web-series/disney-plus/page/%d/" },
    ];

    return Promise.all(
      sections.map(function (sec) {
        var url = sec.url.replace("%d", "1");
        return fetch(url)
          .then(function (r) {
            return { title: sec.title, items: parseCards(r.body) };
          })
          .catch(function () {
            return { title: sec.title, items: [] };
          });
      })
    );
  }

  function getAttr(html, tag, attrName) {
    var re = new RegExp("<" + tag + "[^>]*" + attrName + '=["\']([^"\']*)["\']', "i");
    var m = html.match(re);
    return m ? m[1] : "";
  }

  function extractLinksFromTag(html, parentEnd) {
    var chunk = html.substring(parentEnd);
    var nextP = chunk.indexOf("</p>");
    if (nextP === -1) nextP = chunk.length;
    var block = chunk.substring(0, nextP);
    var links = [];
    var aRe = /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var am;
    while ((am = aRe.exec(block)) !== null) {
      links.push({ href: am[1], text: htmlText(am[2]).trim() });
    }
    return links;
  }

  function getDetail(url, opts) {
    return fetch(url).then(function (r) {
      var html = r.body;

      var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      var title = titleMatch ? stripPrefix(htmlText(titleMatch[1]).split(" - ")[0].split(" | ")[0]) : "";

      var posterMatch = html.match(/<p>\s*<img[^>]+src=["']([^"']*)["']/i);
      var poster = posterMatch ? posterMatch[1] : "";

      var imdbLinkMatch = html.match(/<a[^>]+href=["']([^"']*imdb[^"']*title[^"']*)["']/i);
      var imdbUrl = imdbLinkMatch ? imdbLinkMatch[1] : "";
      var imdbId = "";
      if (imdbUrl) {
        var idM = imdbUrl.match(/title\/(tt\d+)/);
        if (idM) imdbId = idM[1];
      }

      var isSeries = /Series-SYNOPSIS|Series\s*Info/i.test(html);

      var descMatch = html.match(
        /<(?:h3|h2)[^>]*>[\s\S]*?(?:SYNOPSIS\s*\/\s*PLOT|PLOT)[\s\S]*?<\/(?:h3|h2)>([\s\S]*?)(?=<(?:h[2-6]|div))/i
      );
      var description = descMatch ? htmlText(descMatch[1]).trim() : "";

      var yearMatch = html.match(/\b((?:19|20)\d{2})\b/);
      var year = yearMatch ? parseInt(yearMatch[1], 10) : null;

      var result = {
        id: url,
        title: title,
        cover: poster,
        url: url,
        description: description,
        status: "unknown",
        genres: [],
        studios: [],
        type: "movie",
        sourceId: "vegamovies",
        episodes: [],
        year: year,
        subCount: 0,
        dubCount: 0,
      };

      if (isSeries) {
        result.episodes = parseSeriesEpisodes(html, url);
      } else {
        result.episodes = parseMovieEpisodes(html, url);
      }

      if (imdbId) {
        return enrichFromCinemeta(result, imdbId, isSeries);
      }
      return result;
    });
  }

  function enrichFromCinemeta(detail, imdbId, isSeries) {
    var type = isSeries ? "series" : "movie";
    var metaUrl = CINEMETA + "/" + type + "/" + imdbId + ".json";
    return fetch(metaUrl)
      .then(function (r) {
        var data = tryParseJson(r.body);
        if (!data || !data.meta) return detail;
        var meta = data.meta;
        if (meta.name) detail.title = meta.name;
        if (meta.poster) detail.cover = meta.poster;
        if (meta.description) detail.description = meta.description;
        if (meta.genre) detail.genres = meta.genre;
        if (meta.year) detail.year = parseInt(meta.year, 10) || detail.year;
        return detail;
      })
      .catch(function () {
        return detail;
      });
  }

  function parseSeriesEpisodes(html, pageUrl) {
    var episodes = [];
    var headingRe = /<(h[345])[^>]*>([\s\S]*?)<\/\1>/gi;
    var hm;
    var allHeadings = [];
    while ((hm = headingRe.exec(html)) !== null) {
      allHeadings.push({ tag: hm[1], text: htmlText(hm[2]).trim(), index: hm.index, full: hm[0] });
    }

    for (var i = 0; i < allHeadings.length; i++) {
      var h = allHeadings[i];
      var ht = h.text;
      if (!/\d{3,4}[pP]|4K|UHD/i.test(ht)) continue;
      if (/zip|batch/i.test(ht)) continue;

      var seasonMatch = ht.match(/(?:Season\s+|S)(\d+)/i);
      if (!seasonMatch) continue;
      var season = parseInt(seasonMatch[1], 10);

      var nextIdx = i + 1 < allHeadings.length ? allHeadings[i + 1].index : html.length;
      var chunk = html.substring(h.index + h.full.length, nextIdx);

      var linkRe = /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var lm;
      var qualityLinks = [];
      while ((lm = linkRe.exec(chunk)) !== null) {
        var linkText = htmlText(lm[2]).trim();
        if (/V-Cloud|Episode|Download|G-Direct/i.test(linkText)) {
          qualityLinks.push(fixUrl(lm[1], mainUrl));
        }
      }

      for (var j = 0; j < qualityLinks.length; j++) {
        var epEntry = {
          id: "vega://" + encodeURIComponent(JSON.stringify({ type: "series", link: qualityLinks[j], season: season })),
          number: j + 1,
          title: ht + " - Episode " + (j + 1) + " (S" + season + ")",
          url: "vega://" + encodeURIComponent(JSON.stringify({ type: "series", link: qualityLinks[j], season: season })),
        };
        episodes.push(epEntry);
      }
    }

    return episodes;
  }

  function parseMovieEpisodes(html, pageUrl) {
    var episodes = [];
    var btnRe = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<button[^>]*class=["'][^"']*dwd-button[^"']*["']/gi;
    var bm;
    while ((bm = btnRe.exec(html)) !== null) {
      var href = fixUrl(bm[1], mainUrl);
      var inner = bm[2];
      var qualityMatch = inner.match(/(\d{3,4})[pP]/);
      var qualityLabel = qualityMatch ? qualityMatch[0] : "Download";
      episodes.push({
        id: "vega://" + encodeURIComponent(JSON.stringify({ type: "movie", link: href })),
        number: episodes.length + 1,
        title: qualityLabel,
        url: "vega://" + encodeURIComponent(JSON.stringify({ type: "movie", link: href })),
      });
    }

    if (episodes.length === 0) {
      var dwdBtnRe = /<button[^>]*class=["'][^"']*dwd-button[^"']*["'][^>]*>/gi;
      var parentRe = /<a[^>]*href=["']([^"']*)["'][^>]*>(?=[\s\S]*?<button[^>]*class=["'][^"']*dwd-button)/gi;
      var pm;
      while ((pm = parentRe.exec(html)) !== null) {
        var ph = fixUrl(pm[1], mainUrl);
        episodes.push({
          id: "vega://" + encodeURIComponent(JSON.stringify({ type: "movie", link: ph })),
          number: episodes.length + 1,
          title: "Download",
          url: "vega://" + encodeURIComponent(JSON.stringify({ type: "movie", link: ph })),
        });
      }
    }

    return episodes;
  }

  function getEpisodes(url, opts) {
    if (url.indexOf("vega://") === 0) {
      return [];
    }
    return fetch(url).then(function (r) {
      var html = r.body;
      var isSeries = /Series-SYNOPSIS|Series\s*Info/i.test(html);
      if (isSeries) {
        return parseSeriesEpisodes(html, url);
      }
      return parseMovieEpisodes(html, url);
    });
  }

  function resolveVcloudLink(linkUrl) {
    return fetch(linkUrl).then(function (r) {
      var html = r.body;
      var vcloudLinks = [];
      var aRe = /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var m;
      while ((m = aRe.exec(html)) !== null) {
        var text = htmlText(m[2]).trim();
        if (/V-Cloud|vcloud|hubcloud/i.test(text) || /vcloud|hubcloud/i.test(m[1])) {
          vcloudLinks.push(fixUrl(m[1], mainUrl));
        }
      }
      return vcloudLinks;
    });
  }

  function resolveSeriesVcloudLink(intermediateUrl, season) {
    return fetch(intermediateUrl).then(function (r) {
      var html = r.body;
      var links = [];
      var aRe = /<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var m;
      while ((m = aRe.exec(html)) !== null) {
        var text = htmlText(m[2]).trim();
        var href = fixUrl(m[1], mainUrl);
        if (/V-Cloud|vcloud|hubcloud/i.test(text) || /vcloud|hubcloud/i.test(href)) {
          links.push(href);
        }
      }
      return links;
    });
  }

  function extractHubcloudDownload(html, pageUrl) {
    if (pageUrl.indexOf("/video/") !== -1) {
      var vdRe = /<div[^>]*class=["'][^"']*vd[^"']*["'][^>]*>[\s\S]*?<center>[\s\S]*?<a[^>]*href=["']([^"']*)["']/i;
      var vdm = html.match(vdRe);
      if (vdm) return fixUrl(vdm[1], pageUrl);
    }

    var urlRe = /var\s+url\s*=\s*['"]([^'"]+)['"]/;
    var um = html.match(urlRe);
    if (um) return fixUrl(um[1], pageUrl);

    return "";
  }

  function parseQualityFromFilename(filename) {
    var m = filename.match(/(\d{3,4})[pP]/);
    return m ? m[1] : "";
  }

  function extractHubcloudPage(hubUrl) {
    return fetch(hubUrl).then(function (r) {
      var html = r.body;
      var dlUrl = extractHubcloudDownload(html, hubUrl);
      if (!dlUrl) return [];

      return fetch(dlUrl).then(function (r2) {
        var html2 = r2.body;

        var headerRe = /<(?:div|span)[^>]*class=["'][^"']*(?:card-header|filename|file-name)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span)>/i;
        var hm = html2.match(headerRe);
        var filename = hm ? htmlText(hm[1]).trim() : "";

        var sizeRe = /<i[^>]*id=["']size["'][^>]*>([\s\S]*?)<\/i>/i;
        var sm = html2.match(sizeRe);
        var size = sm ? htmlText(sm[1]).trim() : "";

        var quality = parseQualityFromFilename(filename);

        var servers = [];
        var btnRe = /<h2[^>]*>[\s\S]*?<a[^>]*class=["'][^"']*btn[^"']*["'][^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var bm;
        while ((bm = btnRe.exec(html2)) !== null) {
          servers.push({ href: bm[1], text: htmlText(bm[2]).trim() });
        }

        if (servers.length === 0) {
          var aBtnRe = /<a[^>]*class=["'][^"']*btn[^"']*["'][^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
          while ((bm = aBtnRe.exec(html2)) !== null) {
            servers.push({ href: bm[1], text: htmlText(bm[2]).trim() });
          }
        }

        var results = [];
        for (var i = 0; i < servers.length; i++) {
          var srv = servers[i];
          var serverName = srv.text;
          var serverUrl = fixUrl(srv.href, dlUrl);
          var serverLabel = serverName + (quality ? " " + quality + "p" : "") + (size ? " [" + size + "]" : "");

          if (/FSL\s*Server|FSLv2|Mega\s*Server|Download\s*File/i.test(serverName)) {
            results.push({
              url: serverUrl,
              quality: quality ? quality + "p" : "auto",
              container: "mp4",
              headers: {},
              kind: "sub",
              audioLang: "",
              subtitles: [],
            });
          } else if (/BuzzServer/i.test(serverName)) {
            results.push(
              resolveBuzzServer(serverUrl, quality, size).catch(function () {
                return [];
              })
            );
          } else if (/Pixeldrain/i.test(serverName)) {
            results.push(
              resolvePixeldrain(serverUrl, quality).catch(function () {
                return [];
              })
            );
          } else if (/10Gbps/i.test(serverName)) {
            results.push(
              resolve10Gbps(serverUrl, quality).catch(function () {
                return [];
              })
            );
          } else {
            results.push({
              url: serverUrl,
              quality: quality ? quality + "p" : "auto",
              container: "mp4",
              headers: {},
              kind: "sub",
              audioLang: "",
              subtitles: [],
            });
          }
        }

        return Promise.all(
          results.map(function (r) {
            if (r && r.then) return r;
            return Promise.resolve(r instanceof Array ? r : [r]);
          })
        ).then(function (resolved) {
          var flat = [];
          for (var k = 0; k < resolved.length; k++) {
            if (resolved[k] instanceof Array) {
              for (var l = 0; l < resolved[k].length; l++) flat.push(resolved[k][l]);
            } else {
              flat.push(resolved[k]);
            }
          }
          return flat;
        });
      });
    });
  }

  function resolveBuzzServer(url, quality, size) {
    var dlUrl = url.replace(/\/?$/, "/download");
    return fetch(dlUrl, { followRedirects: false }).then(function (r) {
      var redirect = r.headers && (r.headers["hx-redirect"] || r.headers.location || r.headers.Location);
      if (!redirect) return [];
      return [
        {
          url: redirect,
          quality: quality ? quality + "p" : "auto",
          container: "mp4",
          headers: {},
          kind: "sub",
          audioLang: "",
          subtitles: [],
        },
      ];
    });
  }

  function resolvePixeldrain(url, quality) {
    return fetch(url).then(function (r) {
      var html = r.body;
      var pxlRe = /var\s+pxl\s*=\s*['"]([^'"]+)['"]/;
      var m = html.match(pxlRe);
      if (!m) return [];
      var pxlId = m[1];
      return [
        {
          url: "https://pixeldrain.com/api/file/" + pxlId,
          quality: quality ? quality + "p" : "auto",
          container: "mp4",
          headers: {},
          kind: "sub",
          audioLang: "",
          subtitles: [],
        },
      ];
    });
  }

  function resolve10Gbps(url, quality) {
    var current = url;
    var maxRedirects = 7;
    var chain = Promise.resolve(current);

    for (var i = 0; i < maxRedirects; i++) {
      chain = chain.then(function (u) {
        return fetch(u).then(function (r) {
          if (r.ok && r.body) {
            var loc = r.body.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/);
            if (loc) return loc[1];
          }
          return u;
        });
      });
    }

    return chain.then(function (finalUrl) {
      return [
        {
          url: finalUrl,
          quality: quality ? quality + "p" : "auto",
          container: "mp4",
          headers: {},
          kind: "sub",
          audioLang: "",
          subtitles: [],
        },
      ];
    });
  }

  function getVideoSources(episodeUrl, opts) {
    return initDomain().then(function () {
      if (episodeUrl.indexOf("vega://") !== 0) {
        return resolveVcloudLink(episodeUrl).then(function (links) {
          return resolveAllHubcloud(links);
        });
      }

      var decoded = JSON.parse(decodeURIComponent(episodeUrl.substring("vega://".length)));

      if (decoded.type === "movie") {
        return resolveVcloudLink(decoded.link).then(function (links) {
          return resolveAllHubcloud(links);
        });
      }

      if (decoded.type === "series") {
        return resolveSeriesVcloudLink(decoded.link, decoded.season).then(function (links) {
          return resolveAllHubcloud(links);
        });
      }

      return [];
    });
  }

  function resolveAllHubcloud(links) {
    return Promise.all(
      links.map(function (hubUrl) {
        return extractHubcloudPage(hubUrl).catch(function () {
          return [];
        });
      })
    ).then(function (resolved) {
      var flat = [];
      for (var i = 0; i < resolved.length; i++) {
        if (resolved[i] instanceof Array) {
          for (var j = 0; j < resolved[i].length; j++) flat.push(resolved[i][j]);
        }
      }
      return flat;
    });
  }

  return {
    getInfo: getInfo,
    search: search,
    getHome: getHome,
    getDetail: getDetail,
    getEpisodes: getEpisodes,
    getVideoSources: getVideoSources,
  };
})();

function getInfo() {
  return VEGA.getInfo();
}
function search(query, page, opts) {
  return VEGA.search(query, page, opts);
}
function getHome(opts) {
  return VEGA.getHome(opts);
}
function getDetail(url, opts) {
  return VEGA.getDetail(url, opts);
}
function getEpisodes(url, opts) {
  return VEGA.getEpisodes(url, opts);
}
function getVideoSources(episodeUrl, opts) {
  return VEGA.getVideoSources(episodeUrl, opts);
}

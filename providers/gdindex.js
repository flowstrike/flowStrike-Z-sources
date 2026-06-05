var mainUrl = "https://a.111477.xyz";

var sourceId = "gdindex";
var sourceName = "GDIndex";
var sourceType = "movie";
var sourceLang = "en";

var cachedFolders = null;

function encodePath(p) {
    return p.replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function parseEntries(html, parentPath) {
    var results = [];
    var re = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var href = m[1];
        var text = m[2];
        if (!text || text === "../" || text === "./" || href === "/" || href === "../" || href === "./") continue;
        var isFolder = text.charAt(text.length - 1) === "/";
        var name = isFolder ? text.substring(0, text.length - 1) : text;
        if (!name) continue;
        results.push({
            name: name,
            isFolder: isFolder,
            parentFolder: parentPath,
            url: mainUrl + encodePath(parentPath + name + (isFolder ? "/" : ""))
        });
    }
    return results;
}

function getEntryUrl(entry) {
    return mainUrl + encodePath(entry.parentFolder + entry.name + (entry.isFolder ? "/" : ""));
}

function fetchFolder(path) {
    return fetch(mainUrl + encodePath(path), {
        headers: { "User-Agent": "Mozilla/5.0" }
    }).then(function(res) { return res.body || ''; }).then(function(html) {
        return parseEntries(html, path);
    });
}

function isVideoFile(name) {
    var lower = name.toLowerCase();
    return lower.endsWith(".mkv") || lower.endsWith(".mp4") || lower.endsWith(".avi") || lower.endsWith(".ts");
}

function extractSeasonNum(name) {
    var m = name.match(/[Ss](\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function extractEpisodeNum(name) {
    var m = name.match(/[Ee](\d+)/);
    if (m) return parseInt(m[1], 10);
    m = name.match(/[Ee](\d+)/);
    if (m) return parseInt(m[1], 10);
    m = name.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function getInfo() {
    return {
        name: sourceName,
        lang: sourceLang,
        baseUrl: mainUrl,
        logo: '',
        type: sourceType,
        version: "1.0.0"
    };
}

function getHome(opts) {
    return fetchFolder("/").then(function(entries) {
        cachedFolders = entries;
        var cards = [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (!entry.isFolder) continue;
            var card = {
                title: entry.name,
                url: JSON.stringify(entry),
                type: 'movie',
                cover: null,
                id: sourceId + ':' + entry.name,
                sourceId: sourceId
            };
            cards.push(card);
        }
        return [{ title: "All Folders", items: cards }];
    });
}

function search(query, page, opts) {
    var doSearch = function() {
        return fetchFolder("/").then(function(entries) {
            cachedFolders = entries;
            var results = [];
            var q = query.toLowerCase();
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                if (!entry.isFolder) continue;
                if (entry.name.toLowerCase().indexOf(q) === -1) continue;
                results.push({
                    title: entry.name,
                    url: JSON.stringify(entry),
                    type: 'movie',
                    cover: null,
                    id: sourceId + ':' + entry.name,
                    sourceId: sourceId
                });
            }
            return results;
        });
    };

    if (cachedFolders) {
        var results = [];
        var q = query.toLowerCase();
        for (var i = 0; i < cachedFolders.length; i++) {
            var entry = cachedFolders[i];
            if (!entry.isFolder) continue;
            if (entry.name.toLowerCase().indexOf(q) === -1) continue;
            results.push({
                title: entry.name,
                url: JSON.stringify(entry),
                type: 'movie',
                cover: null,
                id: sourceId + ':' + entry.name,
                sourceId: sourceId
            });
        }
        return Promise.resolve(results);
    }
    return doSearch();
}

function getDetail(url, opts) {
    var entry = JSON.parse(url);
    return fetchFolder(entry.parentFolder + entry.name + "/").then(function(contents) {
        var subfolders = [];
        var videos = [];
        for (var i = 0; i < contents.length; i++) {
            if (contents[i].isFolder) {
                subfolders.push(contents[i]);
            } else if (isVideoFile(contents[i].name)) {
                videos.push(contents[i]);
            }
        }

        var seasons = [];
        if (subfolders.length > 0) {
            for (var s = 0; s < subfolders.length; s++) {
                var sf = subfolders[s];
                var sNum = extractSeasonNum(sf.name) || (s + 1);
                seasons.push({ seasonNum: sNum, folder: sf });
            }
        } else if (videos.length > 0) {
            seasons.push({ seasonNum: 1, folder: entry });
        }

        var episodePromises = [];
        for (var si = 0; si < seasons.length; si++) {
            (function(season) {
                if (season.folder === entry) {
                    var eps = [];
                    for (var vi = 0; vi < videos.length; vi++) {
                        var v = videos[vi];
                        var eNum = extractEpisodeNum(v.name) || (vi + 1);
                        eps.push({
                            id: 'S' + season.seasonNum + 'E' + eNum,
                            number: eNum,
                            title: v.name,
                            url: JSON.stringify(v)
                        });
                    }
                    episodePromises.push(Promise.resolve(eps));
                } else {
                    episodePromises.push(
                        fetchFolder(season.folder.parentFolder + season.folder.name + "/").then(function(vids) {
                            var eps = [];
                            for (var vi = 0; vi < vids.length; vi++) {
                                if (!vids[vi].isFolder && isVideoFile(vids[vi].name)) {
                                    var eNum = extractEpisodeNum(vids[vi].name) || (vi + 1);
                                    eps.push({
                                        id: 'S' + season.seasonNum + 'E' + eNum,
                                        number: eNum,
                                        title: vids[vi].name,
                                        url: JSON.stringify(vids[vi])
                                    });
                                }
                            }
                            return eps;
                        })
                    );
                }
            })(seasons[si]);
        }

        return Promise.all(episodePromises).then(function(allEps) {
            var flat = [];
            for (var a = 0; a < allEps.length; a++) {
                for (var b = 0; b < allEps[a].length; b++) {
                    flat.push(allEps[a][b]);
                }
            }
            return {
                title: entry.name,
                url: url,
                type: 'movie',
                cover: null,
                id: sourceId + ':' + entry.name,
                sourceId: sourceId,
                description: '',
                status: 'unknown',
                genres: [],
                studios: [],
                year: null,
                subCount: flat.length,
                dubCount: 0,
                episodes: flat
            };
        });
    });
}

function getEpisodes(url, opts) {
    return getDetail(url).then(function(detail) {
        return detail.episodes || [];
    });
}

function getVideoSources(url, opts) {
    var entry = JSON.parse(url);
    var fileUrl = getEntryUrl(entry);
    var ext = entry.name.toLowerCase();
    var container = "mp4";

    return Promise.resolve([
        {
            url: fileUrl,
            quality: 'auto',
            container: container,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': mainUrl + '/'
            },
            kind: 'sub',
            audioLang: '',
            subtitles: []
        }
    ]);
}

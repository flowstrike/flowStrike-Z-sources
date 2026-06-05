var fs = require('fs');
var https = require('https');
var http = require('http');

// === Simulate Zangetsu QuickJS runtime ===
function nodeFetch(url, opts, redir) {
  opts = opts || {}; redir = redir || 0;
  return new Promise(function(resolve, reject) {
    var mod = url.startsWith('https') ? https : http;
    var ro = { headers: Object.assign({}, opts.headers || {}), method: 'GET' };
    ro.headers['User-Agent'] = ro.headers['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    mod.request(url, ro, function(res) {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redir < 5) {
        res.resume();
        var loc = res.headers.location;
        if (loc.indexOf('//') === 0) loc = 'https:' + loc;
        return nodeFetch(loc, opts, redir + 1).then(resolve).catch(reject);
      }
      var body = '';
      res.on('data', function(d) { body += d; });
      res.on('end', function() {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: res.headers,
          url: url,
          body: body
        });
      });
    }).on('error', reject).end();
  });
}

globalThis.fetch = nodeFetch;
globalThis.htmlText = function(h) {
  return String(h || '').replace(/<[^>]*>/g, '').replace(/&#x([0-9a-fA-F]+);/g, function(_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function(_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
};
globalThis.absUrl = function(href, base) {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (href.indexOf('//') === 0) return 'https:' + href;
  if (!base) return href;
  if (href.charAt(0) === '/') {
    var m = base.match(/^(https?:\/\/[^\/]+)/i);
    return m ? m[1] + href : href;
  }
  return base.replace(/\/$/, '') + '/' + href;
};
globalThis.base64ToBytes = function(s) { return Array.from(Buffer.from(s, 'base64')); };
globalThis.bytesToB64 = function(a) { return Buffer.from(a).toString('base64'); };
globalThis.sha256Hex = function() { return Promise.resolve('0'); };
globalThis.unpackJs = function(s) { return s; };
globalThis.aesCtrDecrypt = function() { return Promise.resolve(''); };
globalThis.extractVideo = function() { return Promise.resolve([]); };

var file = process.argv[2] || 'providers/bollyflix.js';
var code = fs.readFileSync(file, 'utf8');

// Simulate Zangetsu IIFE wrapping
var wrapped = '(function(){\n' + code + '\n' +
  'globalThis.__test = { getInfo: typeof getInfo === "function" ? getInfo : null,' +
  'search: typeof search === "function" ? search : null,' +
  'getHome: typeof getHome === "function" ? getHome : null,' +
  'getDetail: typeof getDetail === "function" ? getDetail : null,' +
  'getEpisodes: typeof getEpisodes === "function" ? getEpisodes : null,' +
  'getVideoSources: typeof getVideoSources === "function" ? getVideoSources : null };\n})();';

try { eval(wrapped); } catch(e) { console.error('EVAL FAILED:', e.message); process.exit(1); }
var P = globalThis.__test;

function assert(cond, msg) { if (!cond) { console.error('  FAIL:', msg); return false; } return true; }

var pass = 0, fail = 0;
function test(name, fn) {
  return fn().then(function(ok) {
    if (ok) { console.log('PASS:', name); pass++; }
    else { console.log('FAIL:', name); fail++; }
  }).catch(function(e) { console.log('FAIL:', name, '-', e.message || e); fail++; });
}

function checkShape(obj, required, label) {
  for (var i = 0; i < required.length; i++) {
    var k = required[i];
    if (obj[k] === undefined || obj[k] === null) {
      console.error('  ' + label + ' missing field: ' + k);
      return false;
    }
  }
  return true;
}

(async function() {
  console.log('=== Testing:', file, '===');

  // 1. getInfo
  var info = P.getInfo();
  var ok = checkShape(info, ['name','lang','baseUrl','type','version'], 'getInfo');
  ok = assert(typeof info.type === 'string' && (info.type === 'anime' || info.type === 'movie'), 'getInfo type must be anime|movie') && ok;
  if (ok) { console.log('  name:', info.name, '| type:', info.type); pass++; }
  else fail++;

  // 2. search
  await test('search returns array with correct shape', async function() {
    var r = await P.search('avengers', 1, {});
    if (!Array.isArray(r) || r.length === 0) return assert(false, 'empty results');
    var item = r[0];
    var ok = checkShape(item, ['id','title','url','type','sourceId'], 'search result');
    ok = assert(item.type === 'anime' || item.type === 'movie', 'search result type must be anime|movie') && ok;
    console.log('  first:', item.title.substring(0, 50), '|', item.url.substring(0, 50));
    return ok;
  });

  // 3. getHome
  await test('getHome returns sections with items', async function() {
    var sections = await P.getHome({});
    if (!Array.isArray(sections) || sections.length === 0) return assert(false, 'no sections');
    var ok = true;
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (!s.title) { console.error('  section missing title'); ok = false; }
      if (!Array.isArray(s.items)) { console.error('  section missing items'); ok = false; }
      else if (s.items.length > 0) {
        var item = s.items[0];
        if (!checkShape(item, ['id','title','url','type','sourceId'], 'home item')) ok = false;
      }
      console.log('  ', s.title + ':', (s.items || []).length, 'items');
    }
    return ok;
  });

  // 4. getDetail (movie)
  var movieDetail = null;
  await test('getDetail (movie) returns correct shape', async function() {
    var sr = await P.search('avengers endgame', 1, {});
    var movie = sr.find(function(x) { return x.title.toLowerCase().indexOf('endgame') > -1 && x.title.toLowerCase().indexOf('series') === -1; });
    if (!movie) {
      sr = await P.search('thunderbolts', 1, {});
      movie = sr.find(function(x) { return x.title.toLowerCase().indexOf('series') === -1; });
    }
    if (!movie) movie = sr[0];
    if (!movie) { console.error('  no movie found'); return false; }
    console.log('  testing:', movie.title.substring(0, 40));
    movieDetail = await P.getDetail(movie.url, {});
    var ok = checkShape(movieDetail, ['id','title','url','status','type','sourceId','episodes','subCount','dubCount'], 'getDetail');
    ok = assert(movieDetail.type === 'anime' || movieDetail.type === 'movie', 'detail type must be anime|movie') && ok;
    ok = assert(Array.isArray(movieDetail.episodes), 'must have episodes array') && ok;
    if (movieDetail.episodes[0]) {
      ok = checkShape(movieDetail.episodes[0], ['id','number','title','url'], 'episode') && ok;
      console.log('  eps:', movieDetail.episodes.length, '| title:', (movieDetail.title || '').substring(0, 30));
    }
    return ok;
  });

  // 5. getEpisodes
  var episodes = null;
  if (movieDetail && movieDetail.episodes[0]) {
    await test('getEpisodes returns array', async function() {
      episodes = await P.getEpisodes(movieDetail.url, {});
      var ok = assert(Array.isArray(episodes) && episodes.length > 0, 'episodes empty');
      if (episodes[0]) ok = checkShape(episodes[0], ['id','number','title','url'], 'episode') && ok;
      return ok;
    });
  }

  // 6. getVideoSources
  if (episodes && episodes[0]) {
    await test('getVideoSources returns playable sources', async function() {
      var sources = await P.getVideoSources(episodes[0].url);
      var ok = assert(Array.isArray(sources), 'not an array');
      if (sources.length > 0) {
        var s = sources[0];
        ok = checkShape(s, ['url','quality','container','headers','kind','audioLang','subtitles'], 'videoSource') && ok;
        ok = assert(s.kind === 'sub' || s.kind === 'dub' || s.kind === 'raw' || s.kind === 'unknown', 'kind must be valid') && ok;
        ok = assert(s.container === 'hls' || s.container === 'mp4' || s.container === 'unknown', 'container must be valid') && ok;
        console.log('  sources:', sources.length, '| first:', s.quality, s.container, s.url.substring(0, 50));
      } else {
        console.log('  WARNING: no sources resolved (may need different page)');
      }
      return ok;
    });
  }

  // 7. getDetail (series)
  await test('getDetail (series) returns episodes', async function() {
    var queries = ['scavengers reign', 'squid game', 'breaking bad', 'the last of us'];
    var series = null;
    var sr = [];
    for (var qi = 0; qi < queries.length && !series; qi++) {
      sr = await P.search(queries[qi], 1, {});
      series = sr.find(function(x) { return x.title.toLowerCase().indexOf('season') > -1 || x.title.toLowerCase().indexOf('series') > -1 || x.title.toLowerCase().indexOf('s01') > -1; });
    }
    if (!series) { console.error('  no series found in results (skipping)'); return true; }
    console.log('  testing:', series.title.substring(0, 40));
    var detail = await P.getDetail(series.url, {});
    var ok = assert(Array.isArray(detail.episodes), 'episodes must be array');
    if (ok && detail.episodes.length > 0) {
      ok = checkShape(detail.episodes[0], ['id','number','title','url'], 'episode') && ok;
      console.log('  eps:', detail.episodes.length);
    } else {
      console.log('  WARNING: 0 episodes for series (may be site issue)');
    }
    return ok;
  });

  console.log('\n=== Results: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail > 0 ? 1 : 0);
})();

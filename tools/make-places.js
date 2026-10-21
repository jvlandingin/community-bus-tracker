#!/usr/bin/env node
'use strict';
/*
  Writes assets/places.txt: the named places along the route that a rider
  might give as where they wait or get off, for the stop picker's search.

    node tools/make-places.js calabarzon-latest.osm.pbf metro_manila-latest.osm.pbf

  The input is OpenStreetMap, as the regional extracts that
  https://download.openstreetmap.fr/extracts/ and
  https://download.geofabrik.de/ publish: one .osm.pbf for each region the
  route crosses (for this one, asia/philippines/calabarzon and
  asia/philippines/metro_manila). Nothing is installed and nothing here
  runs at deploy time: the result is committed, and the page fetches it from
  the site itself when the picker is first opened.

  Why a file rather than a search service. What a rider types into the
  picker is where they wait or where they get off, and nothing about a
  person watching the map ever leaves their phone (CLAUDE.md, "Invariants").
  A geocoder would be sent those words, and would be a second third party
  beside the map tiles. A list along one route is small enough to search on
  the phone itself, so the whole of it is fetched and nothing typed is sent.

  What is kept: things with a name that a rider would point at (a mall, a
  church, a school, a petrol station, a Jollibee, a barangay, a
  subdivision), within STOP_KM of a listed stop or checkpoint, or ROAD_KM of
  the straight line between two stops that are neighbours along the route.
  Streets are left out: one runs along the road for kilometres, and a single
  point for it would be wherever the tool happened to put it. Names that say
  what a thing is but not which one ("Guard House", "Block 9") are left out
  too. A place called what a listed stop is called is the stop, already in
  the list.

  Each line is a name and a point: the place itself, or for an area whose
  middle is off the road (a barangay, a subdivision), the point of its edge
  nearest the road. Then the town it is in, by the town's border in
  OpenStreetMap, so that "bdo imus" finds the BDOs in Imus. The page labels
  each place with its nearest listed stop and measures it along the route
  like any saved stop.

  The route is config.txt's, measured by the tracker's own code, taken out of
  index.html by its markers as the test suites do. A fork with another route
  runs this again with its own region's extracts; test-mystop.js fails while
  the file holds places off the route config.txt describes.

  OpenStreetMap's data is under the Open Database License, and the file this
  writes is a derivative of it: it says so at the top and is offered under
  the same licence (THIRD-PARTY-NOTICES.md).
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'places.txt');

// How near the road a place has to be. Further apart than GAP_KM the line
// between two stops is not the road: there are no stops on CAVITEX for
// 11 km, and nobody gets on or off a bus on an expressway.
const STOP_KM = 0.6, ROAD_KM = 0.35, GAP_KM = 3.5;
// Nodes further off than this are no part of anything near the road, and
// are not kept while the file is read.
const FAR_KM = 3;
// The same name within this far is one place, mapped twice (a mall's
// outline and its pin, its building, its car park's sign). So is the same
// name nearest the same stop, which is how the picker tells places apart:
// two "Jollibee, near Washington" would be one choice offered twice.
const SAME_KM = 0.25;

// What counts as a place a rider would name, by the tag that says what it
// is. The order is which wins when one thing is mapped twice.
const KINDS = [
  ['amenity', 'arts_centre bank bus_station cafe cinema clinic college community_centre conference_centre courthouse ' +
              'embassy events_venue fast_food fire_station food_court fuel grave_yard hospital kindergarten library ' +
              'marketplace pharmacy place_of_worship police post_office public_building restaurant school ' +
              'social_facility theatre townhall university'],
  ['shop', 'appliance bakery car convenience department_store doityourself furniture hardware mall motorcycle ' +
           'pawnbroker supermarket wholesale'],
  ['tourism', 'attraction gallery hotel motel museum resort theme_park viewpoint zoo'],
  ['leisure', 'garden golf_course park resort sports_centre sports_hall stadium water_park'],
  ['historic', 'building castle church memorial monument ruins shrine'],
  ['office', 'government'],
  ['healthcare', 'centre clinic hospital'],
  ['railway', 'halt station'],
  ['public_transport', 'station'],
  ['place', 'city hamlet locality neighbourhood quarter square suburb town village'],
  ['boundary', 'administrative'],
  ['landuse', 'cemetery commercial industrial residential retail'],
  ['highway', 'bus_stop'],
  ['building', 'apartments cathedral chapel church civic college commercial government hospital hotel mosque office ' +
               'public retail school stadium supermarket temple train_station transportation university']
].map(function(k){ return [k[0], new Set(k[1].split(' '))]; });
function kindOf(t){
  for (let i = 0; i < KINDS.length; i++){
    const v = t[KINDS[i][0]];
    if (v === undefined || !KINDS[i][1].has(v)) continue;
    // A barangay, and not the city or province it is in.
    if (KINDS[i][0] === 'boundary' && t.admin_level !== '10') continue;
    return i;
  }
  return -1;
}
// What a thing is, with nothing to say which one, after placeWords().
const GENERIC = /^(?:.* property|(?:purok|block|blk|lot|phase|building|bldg|tower|gate|zone|sitio|area|unit|wing|annex|stall|room|court|covered court|basketball court|chapel|clubhouse|club house|guard ?house|guardhouse|canteen|toilet|comfort room|parking|entrance|exit|office|warehouse|multi ?purpose hall|barangay hall|health center)(?: [0-9a-z]{1,3})*|[0-9 ]+)$/;

function block(html, start, end){
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error('index.html has no block between "' + start + '" and "' + end + '"');
  return html.slice(a, b);
}
// The route as config.txt has it, in the tracker's own terms.
function readRoute(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const R = {};
  new Function('R', block(html, 'function haversineKm(a,b){', 'function timeAgo(ts){') +
    block(html, '// ---- ROUTE PROGRESS + WRONG-DIRECTION GUARD', '// ---- END ROUTE PROGRESS') +
    block(html, "// ---- THE READER'S OWN STOP (unit tested)", '// ---- END MY STOP') +
    'R.haversineKm=haversineKm;R.buildRouteChain=buildRouteChain;R.routeProgressKm=routeProgressKm;' +
    'R.placeWords=placeWords;R.placeIndex=placeIndex;')(R);
  const lines = fs.readFileSync(path.join(ROOT, 'config.txt'), 'utf8').split(/\r?\n/);
  const field = (l, n) => l.split('=').slice(1).join('=').split('|').map(x => x.trim())[n];
  const cps = lines.filter(l => /^CHECKPOINT\s*=/.test(l.trim())).map(l => ({ name: field(l, 0), lat: +field(l, 2), lng: +field(l, 3) }));
  const stops = lines.filter(l => /^STOP\s*=/.test(l.trim())).map(l => ({ name: field(l, 0), lat: +field(l, 1), lng: +field(l, 2) }))
    .filter(s => isFinite(s.lat) && isFinite(s.lng));
  if (cps.length < 2 || !stops.length) throw new Error('config.txt needs its CHECKPOINT and STOP lines');
  const chain = R.buildRouteChain(cps);
  const km = p => R.routeProgressKm(p, cps, chain);
  stops.forEach(s => { s.km = km(s); });
  return { R, cps, stops, km };
}

// How far a point is off the road, in km: from the line between two
// neighbouring stops, or from a stop or checkpoint, less the extra room a
// stop gets. Inside the corridor at ROAD_KM or less. Flat geometry at the
// route's own latitude, as chainPosition() does it.
function corridor(route){
  const all = route.stops.concat(route.cps);
  const lat0 = all.reduce((a, p) => a + p.lat, 0) / all.length;
  const kx = 111.320 * Math.cos(lat0 * Math.PI / 180), ky = 110.574;
  const pts = all.map(p => [p.lng * kx, p.lat * ky]);
  const order = route.stops.slice().sort((a, b) => a.km - b.km);
  const segs = [];
  for (let i = 1; i < order.length; i++){
    const a = order[i - 1], b = order[i];
    if (route.R.haversineKm(a, b) > GAP_KM) continue;
    const ax = a.lng * kx, ay = a.lat * ky, vx = b.lng * kx - ax, vy = b.lat * ky - ay;
    segs.push([ax, ay, vx, vy, vx * vx + vy * vy]);
  }
  const extra = STOP_KM - ROAD_KM;
  // A box around all of it, FAR_KM wider, to turn away the rest of the
  // region without measuring it.
  const lats = all.map(p => p.lat), lngs = all.map(p => p.lng), m = FAR_KM / ky, mx = FAR_KM / kx;
  off.box = [Math.min(...lats) - m, Math.max(...lats) + m, Math.min(...lngs) - mx, Math.max(...lngs) + mx];
  return off;
  function off(lat, lng){
    const x = lng * kx, y = lat * ky;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++){
      const dx = x - pts[i][0], dy = y - pts[i][1], d = Math.sqrt(dx * dx + dy * dy) - extra;
      if (d < best) best = d;
    }
    for (let i = 0; i < segs.length; i++){
      const s = segs[i];
      let t = s[4] > 0 ? ((x - s[0]) * s[2] + (y - s[1]) * s[3]) / s[4] : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const dx = x - s[0] - t * s[2], dy = y - s[1] - t * s[3], d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    return best;
  }
}

// ---- Reading .osm.pbf -------------------------------------------------
// The format is protocol buffers in zlib'd blocks
// (https://wiki.openstreetmap.org/wiki/PBF_Format). This reads the little of
// it this tool needs, in plain Node.
function vint(r){
  const b = r.b; let p = r.p;
  let c = b[p++], x = c & 0x7f;
  if (c >= 0x80){
    c = b[p++]; x |= (c & 0x7f) << 7;
    if (c >= 0x80){
      c = b[p++]; x |= (c & 0x7f) << 14;
      if (c >= 0x80){
        c = b[p++]; x |= (c & 0x7f) << 21;
        // Past 28 bits, by multiplication: ids pass 2^32, and bit
        // operations in JavaScript stop there.
        if (c >= 0x80){ let m = 268435456; do { c = b[p++]; x += (c & 0x7f) * m; m *= 128; } while (c >= 0x80); }
      }
    }
  }
  r.p = p;
  return x;
}
const zigzag = n => n % 2 === 1 ? -(n + 1) / 2 : n / 2;
const int64 = n => n >= 2 ** 63 ? n - 2 ** 64 : n;
function skip(r, w){
  if (w === 0) vint(r);
  else if (w === 1) r.p += 8;
  else if (w === 2){ const n = vint(r); r.p += n; }
  else if (w === 5) r.p += 4;
  else throw new Error('not an .osm.pbf file (wire type ' + w + ')');
}
// Each field of a message in [start, end) as (field, wire type, reader),
// with a length-delimited field's bounds in r.s and r.e. Fields the
// callback does not read are skipped.
function fields(b, start, end, each){
  const r = { b: b, p: start, s: 0, e: 0 };
  while (r.p < end){
    const k = vint(r), f = k >>> 3, w = k & 7;
    if (w === 2){ const n = vint(r); r.s = r.p; r.e = r.p + n; each(f, w, r); r.p = r.e; }
    else { const at = r.p; each(f, w, r); if (r.p === at) skip(r, w); }
  }
}
function packed(r, out, delta){
  const q = { b: r.b, p: r.s };
  let acc = 0;
  out.length = 0;
  while (q.p < r.e){ const v = vint(q); if (delta){ acc += zigzag(v); out.push(acc); } else out.push(v); }
  return out;
}
// Every block of a file, decompressed, with its type, until `each` returns
// false.
function blocks(buf, each){
  let pos = 0;
  while (pos < buf.length){
    const hlen = buf.readUInt32BE(pos); pos += 4;
    let type = '', size = 0;
    fields(buf, pos, pos + hlen, (f, w, r) => {
      if (f === 1 && w === 2) type = buf.toString('utf8', r.s, r.e);
      else if (f === 3 && w === 0) size = vint(r);
    });
    pos += hlen;
    let raw = null, z = null, other = 0;
    fields(buf, pos, pos + size, (f, w, r) => {
      if (f === 1 && w === 2) raw = buf.subarray(r.s, r.e);
      else if (f === 3 && w === 2) z = buf.subarray(r.s, r.e);
      else if (w === 2 && f !== 2) other = f;
    });
    pos += size;
    if (!raw && !z) throw new Error('a block is compressed some other way than zlib (field ' + other + '): convert the file with osmium cat');
    if (each(type, raw || zlib.inflateSync(z)) === false) return;
  }
}
// The header's date, and a refusal of anything this cannot read.
function header(d){
  let when = 0;
  fields(d, 0, d.length, (f, w, r) => {
    if (f === 4 && w === 2){
      const need = d.toString('utf8', r.s, r.e);
      if (need !== 'OsmSchema-V0.6' && need !== 'DenseNodes') throw new Error('the file needs "' + need + '", which this cannot read');
    }
    else if (f === 32 && w === 0) when = int64(vint(r));
  });
  return when;
}
const ID = [], LAT = [], LON = [], KV = [], KEYS = [], VALS = [], REFS = [], ROLES = [], MEMS = [], TYPES = [];
// Calls on.node(id, lat, lon, tags), on.way(id, refs, tags) and
// on.relation(tags, memids, types, roles) for each element of one block;
// tags is null for an element with none, and the arrays are reused.
function elements(d, on){
  let st = null, gran = 100, latOff = 0, lonOff = 0;
  const groups = [];
  fields(d, 0, d.length, (f, w, r) => {
    if (f === 1 && w === 2) st = [r.s, r.e];
    else if (f === 2 && w === 2) groups.push([r.s, r.e]);
    else if (f === 17 && w === 0) gran = vint(r);
    else if (f === 19 && w === 0) latOff = int64(vint(r));
    else if (f === 20 && w === 0) lonOff = int64(vint(r));
  });
  const at = [];
  if (st) fields(d, st[0], st[1], (f, w, r) => { if (f === 1 && w === 2) at.push(r.s, r.e); });
  const seen = new Array(at.length / 2);
  const str = i => seen[i] !== undefined ? seen[i] : (seen[i] = d.toString('utf8', at[2 * i], at[2 * i + 1]));
  const tagsOf = (keys, vals) => { let t = null; for (let i = 0; i < keys.length; i++){ (t || (t = {}))[str(keys[i])] = str(vals[i]); } return t; };
  const deg = (off, v) => 1e-9 * (off + gran * v);
  for (const g of groups){
    fields(d, g[0], g[1], (kind, w, m) => {
      if (w !== 2) return;
      if (kind === 2 && on.node){
        let ids = null, lats = null, lons = null, kv = null;
        fields(d, m.s, m.e, (f, w2, r) => {
          if (w2 !== 2) return;
          if (f === 1) ids = packed(r, ID, true);
          else if (f === 8) lats = packed(r, LAT, true);
          else if (f === 9) lons = packed(r, LON, true);
          else if (f === 10) kv = packed(r, KV, false);
        });
        if (!ids) return;
        for (let i = 0, j = 0; i < ids.length; i++){
          let t = null;
          if (kv){ while (j < kv.length && kv[j] !== 0){ (t || (t = {}))[str(kv[j])] = str(kv[j + 1]); j += 2; } j++; }
          on.node(ids[i], deg(latOff, lats[i]), deg(lonOff, lons[i]), t);
        }
      } else if (kind === 1 && on.node){
        let id = 0, lat = 0, lon = 0;
        KEYS.length = VALS.length = 0;
        fields(d, m.s, m.e, (f, w2, r) => {
          if (f === 1 && w2 === 0) id = zigzag(vint(r));
          else if (f === 8 && w2 === 0) lat = zigzag(vint(r));
          else if (f === 9 && w2 === 0) lon = zigzag(vint(r));
          else if (f === 2 && w2 === 2) packed(r, KEYS, false);
          else if (f === 3 && w2 === 2) packed(r, VALS, false);
        });
        on.node(id, deg(latOff, lat), deg(lonOff, lon), tagsOf(KEYS, VALS));
      } else if (kind === 3 && on.way){
        let id = 0;
        KEYS.length = VALS.length = REFS.length = 0;
        fields(d, m.s, m.e, (f, w2, r) => {
          if (f === 1 && w2 === 0) id = vint(r);
          else if (f === 2 && w2 === 2) packed(r, KEYS, false);
          else if (f === 3 && w2 === 2) packed(r, VALS, false);
          else if (f === 8 && w2 === 2) packed(r, REFS, true);
        });
        on.way(id, REFS, tagsOf(KEYS, VALS));
      } else if (kind === 4 && on.relation){
        KEYS.length = VALS.length = ROLES.length = MEMS.length = TYPES.length = 0;
        fields(d, m.s, m.e, (f, w2, r) => {
          if (f === 2 && w2 === 2) packed(r, KEYS, false);
          else if (f === 3 && w2 === 2) packed(r, VALS, false);
          else if (f === 8 && w2 === 2) packed(r, ROLES, false);
          else if (f === 9 && w2 === 2) packed(r, MEMS, true);
          else if (f === 10 && w2 === 2) packed(r, TYPES, false);
        });
        on.relation(tagsOf(KEYS, VALS), MEMS, TYPES, ROLES.map(str));
      }
    });
  }
}

// ---- Finding the places ------------------------------------------------
function read(file, route, off, found){
  const buf = fs.readFileSync(file);
  const from = found.length;
  let when = 0;
  // First the relations, which come last in the file, after the ways they
  // are made of: the areas drawn as several ways (a mall's grounds, a
  // barangay), and the towns, whose borders say which town a place is in.
  const areas = [], parts = new Set(), towns = [], borders = new Map();
  blocks(buf, (type, d) => {
    if (type === 'OSMHeader'){ when = header(d); return; }
    if (type !== 'OSMData') return;
    elements(d, { relation(t, mems, types, roles){
      if (!t || !t.name) return;
      if (t.boundary === 'administrative' && t.admin_level === '6'){
        const ways = mems.filter((m, i) => types[i] === 1);
        ways.forEach(w => borders.set(w, null));
        towns.push({ name: tidy(t.name), ways });
      }
      if ((t.type !== 'multipolygon' && t.type !== 'boundary') || kindOf(t) < 0) return;
      const ways = [];
      for (let i = 0; i < mems.length; i++) if (types[i] === 1 && roles[i] !== 'inner'){ ways.push(mems[i]); parts.add(mems[i]); }
      if (ways.length) areas.push({ t, ways });
    } });
  });
  // Then the nodes near the route, kept in id order to look up from the
  // ways, and every named thing among the nodes and ways.
  let ids = new Float64Array(1 << 20), lats = new Float64Array(1 << 20), lons = new Float64Array(1 << 20), n = 0;
  const find = id => { let lo = 0, hi = n - 1; while (lo <= hi){ const m = (lo + hi) >>> 1, v = ids[m]; if (v === id) return m; if (v < id) lo = m + 1; else hi = m - 1; } return -1; };
  const shapes = new Map(), box = off.box;
  let ways = false;
  blocks(buf, (type, d) => {
    if (type !== 'OSMData') return;
    elements(d, {
      node(id, lat, lon, t){
        if (ways) throw new Error(file + ' is not sorted with its nodes first: sort it with osmium sort');
        if (lat < box[0] || lat > box[1] || lon < box[2] || lon > box[3]) return;
        if (n && id < ids[n - 1]) throw new Error(file + ' is not sorted by id: sort it with osmium sort');
        const o = off(lat, lon);
        if (o > FAR_KM) return;
        if (n === ids.length){
          const grow = a => { const g = new Float64Array(a.length * 2); g.set(a); return g; };
          ids = grow(ids); lats = grow(lats); lons = grow(lons);
        }
        ids[n] = id; lats[n] = lat; lons[n] = lon; n++;
        if (t && t.name && o <= ROAD_KM){ const k = kindOf(t); if (k >= 0) found.push({ t, k, lat, lng: lon, off: o }); }
      },
      way(id, refs, t){
        ways = true;
        if (borders.has(id)) borders.set(id, Float64Array.from(refs));
        const named = !!(t && t.name) && kindOf(t) >= 0, part = parts.has(id);
        if (!named && !part) return;
        // Its middle, and the point of it nearest the road.
        let sa = 0, so = 0, c = 0, best = null;
        for (let i = 0; i < refs.length; i++){
          const j = find(refs[i]);
          if (j < 0) continue;
          sa += lats[j]; so += lons[j]; c++;
          const o = off(lats[j], lons[j]);
          if (!best || o < best.off) best = { lat: lats[j], lng: lons[j], off: o };
        }
        if (!c) return;
        const s = { lat: sa / c, lng: so / c, c, best };
        if (part) shapes.set(id, s);
        if (named) placed(found, t, s, off);
      }
    });
  });
  for (const a of areas){
    let sa = 0, so = 0, c = 0, best = null;
    for (const w of a.ways){
      const s = shapes.get(w);
      if (!s) continue;
      sa += s.lat * s.c; so += s.lng * s.c; c += s.c;
      if (!best || s.best.off < best.off) best = s.best;
    }
    if (c) placed(found, a.t, { lat: sa / c, lng: so / c, best }, off);
  }
  // Last, the towns' borders, which run far from the road where no node was
  // kept: through the nodes once more, for theirs alone, stopping where the
  // ways begin.
  const need = new Set(), at = new Map();
  borders.forEach(refs => { if (refs) refs.forEach(id => need.add(id)); });
  blocks(buf, (type, d) => {
    if (type !== 'OSMData') return;
    let more = true;
    elements(d, { node(id, lat, lon){ if (need.has(id)) at.set(id, [lat, lon]); }, way(){ more = false; } });
    return more;
  });
  const whole = towns.map(town => shape(town, borders, at)).filter(Boolean);
  for (let i = from; i < found.length; i++) found[i].town = townOf(found[i], whole);
  return when;
}
// A town as the line segments of its borders, all of them, outer and inner,
// in no order: a point is in it if a line from the point due east crosses
// them an odd number of times. A border the file does not hold whole would
// give wrong answers, so a town with one is left out.
function shape(town, borders, at){
  const segs = [], box = [Infinity, -Infinity, Infinity, -Infinity];
  for (const w of town.ways){
    const refs = borders.get(w);
    if (!refs) return null;
    let prev = null;
    for (let i = 0; i < refs.length; i++){
      const p = at.get(refs[i]);
      if (!p) return null;
      if (prev) segs.push(prev[0], prev[1], p[0], p[1]);
      prev = p;
      box[0] = Math.min(box[0], p[0]); box[1] = Math.max(box[1], p[0]);
      box[2] = Math.min(box[2], p[1]); box[3] = Math.max(box[3], p[1]);
    }
  }
  return segs.length ? { name: town.name, segs, box } : null;
}
function townOf(p, towns){
  for (const t of towns){
    if (p.lat < t.box[0] || p.lat > t.box[1] || p.lng < t.box[2] || p.lng > t.box[3]) continue;
    const s = t.segs;
    let inside = false;
    for (let i = 0; i < s.length; i += 4){
      if ((s[i] > p.lat) !== (s[i + 2] > p.lat) &&
          p.lng < s[i + 1] + (p.lat - s[i]) * (s[i + 3] - s[i + 1]) / (s[i + 2] - s[i])) inside = !inside;
    }
    if (inside) return t.name;
  }
  return '';
}
// An area at its middle if that is near the road, or else at its edge
// nearest the road, if that is.
function placed(found, t, s, off){
  const k = kindOf(t), o = off(s.lat, s.lng);
  if (o <= ROAD_KM) found.push({ t, k, lat: s.lat, lng: s.lng, off: o });
  else if (s.best && s.best.off <= ROAD_KM) found.push({ t, k, lat: s.best.lat, lng: s.best.lng, off: s.best.off });
}

const tidy = s => String(s).replace(/[|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
// The name a rider sees: a branch's name beside its chain's, when OSM has
// one ("7-Eleven (Mendez Junction)"), since a chain is everywhere.
function nameOf(t, words){
  const n = tidy(t.name), b = tidy(t.branch || '');
  return b && words(n).indexOf(words(b)) < 0 ? n + ' (' + b + ')' : n;
}
function settle(found, route){
  const words = route.R.placeWords, hav = route.R.haversineKm;
  const listed = route.stops.concat(route.cps);
  const kept = new Map();
  found.sort((a, b) => a.k - b.k || a.off - b.off);
  for (const f of found){
    const name = nameOf(f.t, words), key = words(name);
    if (key.length < 2 || GENERIC.test(key)) continue;
    // Already in the list, as a stop or a checkpoint.
    if (listed.some(s => words(s.name) === key && hav(s, f) <= 1.5)) continue;
    // Where the file will say it is, to within about 5 m, and so where the
    // page will measure it from: a few metres can move a place from one leg
    // of the route to the next where the route turns.
    const at = { name, lat: +f.lat.toFixed(4), lng: +f.lng.toFixed(4) };
    const near = (route.R.placeIndex([at], route.stops)[0] || {}).near;
    if (!near) continue;
    const same = kept.get(key) || [];
    if (same.some(p => p.near === near || hav(p, at) <= SAME_KM)) continue;
    same.push({ name, lat: at.lat, lng: at.lng, k: f.k, town: f.town || '', near });
    kept.set(key, same);
  }
  const out = [];
  kept.forEach(list => list.forEach(p => { p.km = route.km(p); out.push(p); }));
  return out.sort((a, b) => a.km - b.km || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function main(){
  const files = process.argv.slice(2);
  if (!files.length){
    console.error('usage: node tools/make-places.js region-latest.osm.pbf [another.osm.pbf ...]');
    process.exit(1);
  }
  const route = readRoute(), off = corridor(route);
  const found = [];
  let when = Infinity;
  for (const f of files){
    const t = read(f, route, off, found);
    if (t > 0 && t < when) when = t;
  }
  const places = settle(found, route);
  const date = isFinite(when) ? new Date(when * 1000).toISOString().slice(0, 10) : '';
  const head = [
    '# Places along the route, for the stop picker\'s search: what a rider might',
    '# give as where they wait or get off, besides the stops in config.txt.',
    '# Written by tools/make-places.js' + (date ? ' from OpenStreetMap as of ' + date : ' from OpenStreetMap') + ';',
    '# run it again rather than editing this by hand.',
    '#',
    '# © OpenStreetMap contributors. The data is under the Open Database License',
    '# 1.0 (https://www.openstreetmap.org/copyright), and this file, a',
    '# derivative of it, is offered under the same licence.',
    '#',
    '# name | latitude | longitude | town, by its border in OpenStreetMap'
  ];
  const body = places.map(p => p.name + '|' + p.lat.toFixed(4) + '|' + p.lng.toFixed(4) + (p.town ? '|' + p.town : ''));
  fs.writeFileSync(OUT, head.concat(body).join('\n') + '\n');
  const by = {}, towns = {};
  places.forEach(p => { const k = KINDS[p.k][0]; by[k] = (by[k] || 0) + 1; towns[p.town || '(no town)'] = (towns[p.town || '(no town)'] || 0) + 1; });
  const list = o => Object.keys(o).sort((a, b) => o[b] - o[a]).map(k => o[k] + ' ' + k).join(', ');
  console.log(path.relative(ROOT, OUT) + ': ' + places.length + ' places, ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
  console.log('  by kind: ' + list(by));
  // A town missing here is one whose border the extracts cut off: its
  // places can still be searched by name and by the stop they are near.
  console.log('  by town: ' + list(towns));
}

main();

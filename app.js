/* ===========================================================
   Nordic Slot Tool — SCR / GCR message generator
   Vanilla JS, no dependencies. Builds IATA SSIM Ch.6 messages.

   One slot at a time (arrival + departure), with a New / Change /
   Delete operation and a Clear button.

   Grammar references:
   - SCR  : Slot Coordination Switzerland "SCR Crash Course" (SSIM ch.6)
   - GCR  : Slot Coordination Czech Republic "GCR manual"
   =========================================================== */

'use strict';

/* ----------------------------- reference data ----------------------------- */

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// [IATA, ICAO, name] — Nordic coordinated/notable airports + a few common hubs
const AIRPORTS = [
  ['OSL','ENGM','Oslo Gardermoen'], ['BGO','ENBR','Bergen'], ['SVG','ENZV','Stavanger'],
  ['TRD','ENVA','Trondheim'], ['TOS','ENTC','Tromso'], ['BOO','ENBO','Bodo'],
  ['AES','ENAL','Alesund'], ['KRS','ENCN','Kristiansand'], ['SVJ','ENSK','Svolvaer'],
  ['ARN','ESSA','Stockholm Arlanda'], ['BMA','ESSB','Stockholm Bromma'],
  ['GOT','ESGG','Goteborg Landvetter'], ['MMX','ESMS','Malmo'], ['LLA','ESPA','Lulea'],
  ['UME','ESNU','Umea'], ['OSD','ESNZ','Ostersund'],
  ['CPH','EKCH','Copenhagen'], ['BLL','EKBI','Billund'], ['AAL','EKYT','Aalborg'],
  ['AAR','EKAH','Aarhus'],
  ['HEL','EFHK','Helsinki Vantaa'], ['TMP','EFTP','Tampere'], ['OUL','EFOU','Oulu'],
  ['RVN','EFRO','Rovaniemi'], ['TKU','EFTU','Turku'], ['VAA','EFVA','Vaasa'],
  ['KEF','BIKF','Keflavik'], ['RKV','BIRK','Reykjavik'],
  // common European routings
  ['LHR','EGLL','London Heathrow'], ['AMS','EHAM','Amsterdam'], ['FRA','EDDF','Frankfurt'],
  ['CDG','LFPG','Paris CDG'], ['MUC','EDDM','Munich'], ['ZRH','LSZH','Zurich'],
  ['BRU','EBBR','Brussels'], ['WAW','EPWA','Warsaw'], ['TLL','EETN','Tallinn'],
  ['RIX','EVRA','Riga'], ['VNO','EYVI','Vilnius'],
];

const ACTYPES_IATA = ['319','320','321','32N','32Q','738','73H','7M8','333','339','359','35K','788','789','76W','E90','E95','CR9','CRK','AT7','AT5','DH4','SU9','BCS3'];
const ACTYPES_ICAO = ['C25A','C25B','C25C','C510','C56X','C68A','C700','CL30','CL35','CL60','GLEX','GL5T','GLF4','GLF5','G280','GA5C','GA6C','FA7X','FA8X','F2TH','E55P','E550','E545','PC12','PC24','TBM9','BE20','BE9L','C208','PAY3','H25B','LJ45','LJ60','GLF6'];

// Full IATA SSIM (Chapter 6) service-type table. The same set is valid for SCR and GCR
// — several codes (I, U, X) are defined "Chapter 6 only", i.e. specifically for slot messages.
const SERVICE_TYPES_ALL = [
  // passenger
  ['J','Scheduled passenger'],
  ['S','Scheduled passenger (shuttle)'],
  ['G','Additional passenger'],
  ['B','Additional passenger (shuttle)'],
  ['C','Charter passenger'],
  // cargo / mail
  ['F','Scheduled cargo / mail'],
  ['H','Charter cargo / mail'],
  ['A','Additional cargo / mail'],
  ['M','Mail only'],
  ['V','Surface transport (truck)'],
  ['L','Passenger + cargo / mail'],
  ['Q','Passenger / cargo in cabin'],
  ['R','Passenger / cargo in cabin (mixed)'],
  ['O','Charter, special handling'],
  // general / business / state / special
  ['D','General aviation'],
  ['N','Business aviation / air taxi'],
  ['E','State / government'],
  ['I','State / diplomatic'],
  ['U','Air ambulance / humanitarian'],
  ['W','Military'],
  // non-revenue / technical
  ['P','Positioning / ferry / demo'],
  ['K','Crew training'],
  ['T','Technical test'],
  ['X','Technical stop'],
];
const SERVICE_TYPES = { SCR: SERVICE_TYPES_ALL, GCR: SERVICE_TYPES_ALL };

// shown in the reference panel
const ACTIONS = [
  { code:'N', label:'New schedule',               types:['SCR','GCR'] },
  { code:'C', label:'Schedule to be changed',     types:['SCR','GCR'] },
  { code:'R', label:'Revised schedule',           types:['SCR','GCR'] },
  { code:'L', label:'Revised — no offer',         types:['SCR'] },
  { code:'D', label:'Delete schedule',            types:['SCR','GCR'] },
  { code:'A', label:'Accept offer (final)',       types:['SCR'] },
  { code:'P', label:'Accept offer (waitlist)',    types:['SCR'] },
  { code:'Z', label:'Decline offer',              types:['SCR'] },
];

const TYPE_HINTS = {
  SCR: 'Commercial: scheduled, charter, additional, positioning linked to commercial ops, test, training. IATA airline + airport codes.',
  GCR: 'General/business aviation, ferry/positioning not linked to commercial ops, state & diplomatic. ICAO airport codes; one date per line.',
};

const OP_HINTS = {
  new:    'Apply for a new slot.',
  change: 'Give the slot the coordinator currently holds (C) and the revised slot you want (R).',
  delete: 'Cancel a held slot — the details must match exactly what the coordinator holds.',
};

/* ----------------------------- small helpers ------------------------------ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const clean = s => (s || '').toString().replace(/\s+/g, '').toUpperCase();
const esc = s => (s || '').toString().replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

function isoToDDMMM(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return String(d).padStart(2, '0') + MONTHS[m - 1];
}

function isoWeekday(iso) {                 // Mon = 1 … Sun = 7
  if (!iso) return 0;
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

const daysFromWeekday = wd => Array.from({ length: 7 }, (_, i) => (i + 1 === wd ? i + 1 : 0)).join('');
const daysFromArray   = arr => arr.map((on, i) => (on ? i + 1 : 0)).join('');

function lastSundayOfMonth(year, monthIdx0) {
  const last = new Date(Date.UTC(year, monthIdx0 + 1, 0));
  return new Date(Date.UTC(year, monthIdx0, last.getUTCDate() - last.getUTCDay()));
}

function seasonForIso(iso) {               // IATA season code, e.g. S25 / W24
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const summerStart = lastSundayOfMonth(y, 2);   // last Sun of March
  const winterStart = lastSundayOfMonth(y, 9);   // last Sun of October
  if (date >= summerStart && date < winterStart) return 'S' + String(y).slice(-2);
  if (date < summerStart)                         return 'W' + String(y - 1).slice(-2); // Jan–Mar belongs to prev winter
  return 'W' + String(y).slice(-2);
}

function padSeats(v) {
  const digits = (v || '').toString().replace(/\D/g, '');
  if (!digits) return '';
  return digits.length < 3 ? digits.padStart(3, '0') : digits;
}

const airportByIata = code => AIRPORTS.find(a => a[0] === code);
const airportByIcao = code => AIRPORTS.find(a => a[1] === code);

const needArrOf = kind => kind === 'turnaround' || kind === 'both' || kind === 'arrival';
const needDepOf = kind => kind === 'turnaround' || kind === 'both' || kind === 'departure';

/* --------------------------------- state ---------------------------------- */

const LS_KEY = 'nordic-slot-tool/v1';

function newSlot() {
  return {
    kind: 'turnaround',                  // SCR: turnaround/arrival/departure ; GCR: both/arrival/departure
    arrFlight: '', depFlight: '', ident: '',
    singleDay: true, dateFrom: '', dateTo: '',
    days: [false, false, false, false, false, false, false],
    date: '', dateDep: '',
    seats: '', acType: '',
    origin: '', arrTime: '',
    depTime: '', depOffset: 0, dest: '',
    arrSvc: 'J', depSvc: 'J',
    svc: 'D', regRef: '',
  };
}

const state = {
  type: 'SCR',
  gcrMode: 'FLT',
  operation: 'new',                      // 'new' | 'change' | 'delete'
  header: { season: '', msgDate: '', scrAirport: '', creatorRef: '', gcrAirport: '' },
  footer: { si: '', gi: 'BRGDS' },
  slot: newSlot(),
  revised: newSlot(),
};

function coerceSlotKind(s) {
  if (state.type === 'GCR' && !['both', 'arrival', 'departure'].includes(s.kind)) s.kind = 'both';
  if (state.type === 'SCR' && !['turnaround', 'arrival', 'departure'].includes(s.kind)) s.kind = 'turnaround';
}
function coerceKinds() {
  coerceSlotKind(state.slot);
  state.revised.kind = state.slot.kind;  // movement is shared between held and revised
}

function copyHeldToRevised() {
  state.revised = JSON.parse(JSON.stringify(state.slot));
}

function clearSlot() {
  state.slot = newSlot();
  state.revised = newSlot();
  state.operation = 'new';
  coerceKinds();
}

/* ------------------------------ persistence ------------------------------- */

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
}

function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) {}
  if (!saved || typeof saved !== 'object') return false;
  state.type      = saved.type === 'GCR' ? 'GCR' : 'SCR';
  state.gcrMode   = saved.gcrMode === 'REG' ? 'REG' : 'FLT';
  state.operation = ['new', 'change', 'delete'].includes(saved.operation) ? saved.operation : 'new';
  state.header    = { ...state.header, ...(saved.header || {}) };
  state.footer    = { ...state.footer, ...(saved.footer || {}) };
  state.slot      = { ...newSlot(), ...(saved.slot || {}) };
  state.revised   = { ...newSlot(), ...(saved.revised || {}) };
  if (!Array.isArray(state.slot.days))    state.slot.days = newSlot().days;
  if (!Array.isArray(state.revised.days)) state.revised.days = newSlot().days;
  coerceKinds();
  return true;
}

/* ------------------------------- generation ------------------------------- */

function scrLine(e) {
  const A = e.action;
  const arrF = clean(e.arrFlight) || '«ARRFLT»';
  const depF = clean(e.depFlight) || '«DEPFLT»';
  const d1 = isoToDDMMM(e.dateFrom) || '«DDMMM»';
  const d2 = (e.singleDay ? isoToDDMMM(e.dateFrom) : isoToDDMMM(e.dateTo)) || '«DDMMM»';
  const period = d1 + d2;

  let days;
  if (e.singleDay) { const wd = isoWeekday(e.dateFrom); days = wd ? daysFromWeekday(wd) : '«DAYS»'; }
  else            { const ds = daysFromArray(e.days);  days = /[1-7]/.test(ds) ? ds : '«DAYS»'; }

  const st   = (padSeats(e.seats) || '«STS»') + (clean(e.acType) || '«TYP»');
  const orig = clean(e.origin) || '«ORG»';
  const dest = clean(e.dest)   || '«DST»';
  const at   = clean(e.arrTime) || '«HHMM»';
  const dt   = clean(e.depTime) || '«HHMM»';
  const ovn  = Number(e.depOffset) > 0 ? String(Number(e.depOffset)) : '';
  const sa   = clean(e.arrSvc) || '«S»';
  const sd   = clean(e.depSvc) || '«S»';

  if (e.kind === 'turnaround')
    return `${A}${arrF} ${depF} ${period} ${days} ${st} ${orig}${at} ${dt}${ovn}${dest} ${sa}${sd}`;
  if (e.kind === 'arrival')
    return `${A}${arrF} ${period} ${days} ${st} ${orig}${at} ${sa}`;
  return `${A} ${depF} ${period} ${days} ${st} ${dt}${ovn}${dest} ${sd}`;   // departure (space after action)
}

function gcrOneLine(e, dir) {
  const A = e.action;
  const ident = state.gcrMode === 'REG'
    ? (clean(e.ident) || '«REG»')
    : (dir === 'arr' ? (clean(e.arrFlight) || '«ARRFLT»') : (clean(e.depFlight) || '«DEPFLT»'));
  const dateIso = (dir === 'dep' && e.kind === 'both') ? e.dateDep : e.date;
  const date = isoToDDMMM(dateIso) || '«DDMMM»';
  const st   = (padSeats(e.seats) || '«STS»') + (clean(e.acType) || '«TYPE»');
  const svc  = clean(e.svc) || '«S»';
  const ref  = (state.gcrMode === 'FLT' && clean(e.regRef)) ? ` / RE.${clean(e.regRef)}/` : '';

  if (dir === 'dep') {
    const dest = clean(e.dest) || '«DEST»';
    const dt   = clean(e.depTime) || '«HHMM»';
    return `${A} ${ident} ${date} ${st} ${dt}${dest} ${svc}${ref}`;   // departure (space after action)
  }
  const orig = clean(e.origin) || '«ORIG»';
  const at   = clean(e.arrTime) || '«HHMM»';
  return `${A}${ident} ${date} ${st} ${orig}${at} ${svc}${ref}`;       // arrival (no space)
}

function gcrLines(e) {
  if (e.kind === 'both')      return [gcrOneLine(e, 'arr'), gcrOneLine(e, 'dep')];
  if (e.kind === 'departure') return [gcrOneLine(e, 'dep')];
  return [gcrOneLine(e, 'arr')];
}

// produce the action-coded records for the chosen operation, in send order
function entryFrom(s, action, kindOverride) {
  return Object.assign({}, s, { action, kind: kindOverride || s.kind });
}

function buildEntries() {
  const op = state.operation;
  if (op === 'new')    return [entryFrom(state.slot, 'N')];
  if (op === 'delete') return [entryFrom(state.slot, 'D')];

  // change: C (held) + R (revised)
  if (state.type === 'SCR') return [entryFrom(state.slot, 'C'), entryFrom(state.revised, 'R')];

  // GCR change: group the C/R pair per movement (C-arr, R-arr, C-dep, R-dep)
  const k = state.slot.kind;
  const dirs = k === 'both' ? ['arrival', 'departure'] : [k];
  const out = [];
  dirs.forEach(d => { out.push(entryFrom(state.slot, 'C', d), entryFrom(state.revised, 'R', d)); });
  return out;
}

function generate() {
  const lines = [];
  const entries = buildEntries();
  if (state.type === 'SCR') {
    lines.push('SCR');
    lines.push('/' + (state.header.creatorRef ? state.header.creatorRef.trim() : ''));
    lines.push(clean(state.header.season)   || '«SEASON»');
    lines.push(isoToDDMMM(state.header.msgDate) || '«DATE»');
    lines.push(clean(state.header.scrAirport) || '«APT»');
    entries.forEach(e => lines.push(scrLine(e)));
  } else {
    lines.push('GCR');
    lines.push('/' + state.gcrMode);
    lines.push(clean(state.header.gcrAirport) || '«APT»');
    entries.forEach(e => gcrLines(e).forEach(l => lines.push(l)));
  }

  const si = (state.footer.si || '').trim();
  const gi = (state.footer.gi || '').trim();
  if (si) lines.push('SI ' + si);
  if (gi) lines.push('GI ' + gi);

  return lines.join('\n');
}

/* ------------------------------- validation ------------------------------- */

const RE = {
  time:   /^([01]\d|2[0-3])[0-5]\d$/,
  seats:  /^\d{3}$/,
  season: /^[SW]\d{2}$/,
  iata:   /^[A-Z]{3}$/,
  icao:   /^[A-Z]{4}$/,
  flight: /^[A-Z]{2,3}\d{1,4}[A-Z]?$/,
  acIata: /^[A-Z0-9]{3}$/,
  acIcao: /^[A-Z0-9]{4}$/,
};

function validateSlot(s, prefix, w) {
  const p = prefix ? `${prefix}: ` : '';
  const needArr = needArrOf(s.kind);
  const needDep = needDepOf(s.kind);

  if (state.type === 'SCR') {
    if (needArr && !RE.flight.test(clean(s.arrFlight))) w.push(`${p}check arrival flight designator.`);
    if (needDep && !RE.flight.test(clean(s.depFlight))) w.push(`${p}check departure flight designator.`);
    if (!isoToDDMMM(s.dateFrom)) w.push(`${p}set a date.`);
    if (!s.singleDay && !isoToDDMMM(s.dateTo)) w.push(`${p}set an end date (or switch to single day).`);
    if (!s.singleDay && !/[1-7]/.test(daysFromArray(s.days))) w.push(`${p}pick at least one day of operation.`);
    if (!RE.seats.test(padSeats(s.seats))) w.push(`${p}seats must be 3 digits.`);
    if (!RE.acIata.test(clean(s.acType))) w.push(`${p}aircraft type must be 3 chars (IATA).`);
    if (needArr && !RE.iata.test(clean(s.origin))) w.push(`${p}origin must be a 3-letter code.`);
    if (needArr && !RE.time.test(clean(s.arrTime))) w.push(`${p}arrival time must be HHMM.`);
    if (needDep && !RE.iata.test(clean(s.dest))) w.push(`${p}destination must be a 3-letter code.`);
    if (needDep && !RE.time.test(clean(s.depTime))) w.push(`${p}departure time must be HHMM.`);
  } else {
    if (state.gcrMode === 'REG') {
      if (!clean(s.ident)) w.push(`${p}enter the registration.`);
    } else {
      if (needArr && !clean(s.arrFlight)) w.push(`${p}enter the arrival flight number.`);
      if (needDep && !clean(s.depFlight)) w.push(`${p}enter the departure flight number.`);
    }
    if (!isoToDDMMM(s.date)) w.push(`${p}set ${s.kind === 'both' ? 'an arrival date' : 'a date'}.`);
    if (s.kind === 'both' && !isoToDDMMM(s.dateDep)) w.push(`${p}set a departure date.`);
    if (!RE.seats.test(padSeats(s.seats))) w.push(`${p}seats must be 3 digits.`);
    if (!RE.acIcao.test(clean(s.acType))) w.push(`${p}aircraft type must be 4 chars (ICAO).`);
    if (needArr && !RE.icao.test(clean(s.origin))) w.push(`${p}origin must be a 4-letter ICAO code.`);
    if (needArr && !RE.time.test(clean(s.arrTime))) w.push(`${p}arrival time must be HHMM.`);
    if (needDep && !RE.icao.test(clean(s.dest))) w.push(`${p}destination must be a 4-letter ICAO code.`);
    if (needDep && !RE.time.test(clean(s.depTime))) w.push(`${p}departure time must be HHMM.`);
  }
}

function validate() {
  const w = [];
  const h = state.header;
  if (state.type === 'SCR') {
    if (!RE.season.test(clean(h.season))) w.push('Season should look like S25 or W24.');
    if (!isoToDDMMM(h.msgDate))           w.push('Set a message date.');
    if (!RE.iata.test(clean(h.scrAirport))) w.push('Coordinated airport must be a 3-letter IATA code.');
  } else {
    if (!RE.icao.test(clean(h.gcrAirport))) w.push('Coordinated airport must be a 4-letter ICAO code.');
  }

  if (state.operation === 'change') {
    validateSlot(state.slot, 'Held', w);
    validateSlot(state.revised, 'Revised', w);
  } else {
    validateSlot(state.slot, '', w);
  }
  return w;
}

/* -------------------------------- rendering ------------------------------- */

function opt(value, label, sel) {
  return `<option value="${esc(value)}"${sel === value ? ' selected' : ''}>${esc(label)}</option>`;
}

function field(label, inner, help) {
  return `<label class="field"><span class="field-label">${label}</span>${inner}${help ? `<span class="field-help">${help}</span>` : ''}</label>`;
}

function inp(scope, fld, val, attrs = '') {
  return `<input type="text" data-scope="${scope}" data-field="${fld}" value="${esc(val)}" autocomplete="off" spellcheck="false" ${attrs} />`;
}

// date input with an id'd help span, so its readout can refresh without rebuilding the input element
function dateField(label, scope, fld, val, helpId, helpText) {
  return `<label class="field"><span class="field-label">${label}</span>`
    + `<input type="date" data-scope="${scope}" data-field="${fld}" value="${esc(val)}" />`
    + `<span class="field-help" id="${helpId}">${helpText}</span></label>`;
}

function renderHeaderVisibility() {
  $('#scrHeader').classList.toggle('hidden', state.type !== 'SCR');
  $('#gcrHeader').classList.toggle('hidden', state.type !== 'GCR');
  $$('#typeSeg .seg-btn').forEach(b => {
    const on = b.dataset.type === state.type;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $$('#gcrModeSeg .seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === state.gcrMode));
  $('#typeHint').textContent = TYPE_HINTS[state.type];
}

function renderOperation() {
  $$('#opSeg .seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.op === state.operation));
  $('#opHint').textContent = OP_HINTS[state.operation];
}

function renderFieldGroup(s, scope) {
  const isSCR = state.type === 'SCR';
  const needArr = needArrOf(s.kind);
  const needDep = needDepOf(s.kind);
  const svcOpts = sel => SERVICE_TYPES[state.type].map(([c, l]) => opt(c, `${c} — ${l}`, sel)).join('');
  const rows = [];

  /* identifiers */
  if (isSCR) {
    const ids = [];
    if (needArr) ids.push(field('Arrival flight', inp(scope, 'arrFlight', s.arrFlight, 'class="mono up" placeholder="SK4321"')));
    if (needDep) ids.push(field('Departure flight', inp(scope, 'depFlight', s.depFlight, 'class="mono up" placeholder="SK4322"')));
    rows.push(`<div class="entry-row">${ids.join('')}</div>`);
  } else if (state.gcrMode === 'REG') {
    rows.push(`<div class="entry-row">${field('Aircraft registration', inp(scope, 'ident', s.ident, 'class="mono up" placeholder="OYABC"'), s.kind === 'both' ? 'Used on both the arrival and departure lines' : '')}</div>`);
  } else {
    const ids = [];
    if (needArr) ids.push(field('Arrival flight / call sign', inp(scope, 'arrFlight', s.arrFlight, 'class="mono up" placeholder="ABC123"')));
    if (needDep) ids.push(field('Departure flight / call sign', inp(scope, 'depFlight', s.depFlight, 'class="mono up" placeholder="ABC456"')));
    rows.push(`<div class="entry-row">${ids.join('')}</div>`);
  }

  /* dates / days */
  if (isSCR) {
    const single = s.singleDay;
    const wdNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dateHint = isoToDDMMM(s.dateFrom) ? `${isoToDDMMM(s.dateFrom)} (${wdNames[isoWeekday(s.dateFrom)]})` : 'DDMMM';
    const dateInputs = single
      ? dateField('Date', scope, 'dateFrom', s.dateFrom, `datehint-${scope}`, dateHint)
      : field('From', `<input type="date" data-scope="${scope}" data-field="dateFrom" value="${esc(s.dateFrom)}" />`)
        + field('To', `<input type="date" data-scope="${scope}" data-field="dateTo" value="${esc(s.dateTo)}" />`);
    const modeToggle = `<label class="field">
      <span class="field-label">Schedule</span>
      <div class="seg seg-mini" role="group" aria-label="Single day or recurring flight">
        <button type="button" class="seg-btn${single ? ' is-active' : ''}" data-daymode="${scope}" data-single="1">Single day</button>
        <button type="button" class="seg-btn${!single ? ' is-active' : ''}" data-daymode="${scope}" data-single="0">Recurring</button>
      </div>
      <span class="field-help">${single ? 'A one-off flight on a single date' : 'Recurring flight: operates on the selected weekdays across a date range'}</span>
    </label>`;

    let dow;
    if (single) {
      const wd = isoWeekday(s.dateFrom);
      dow = `<div class="dow"><span class="field-label">Day of operation</span><span class="dow-readout${wd ? '' : ' dim'}" id="dowread-${scope}">${wd ? daysFromWeekday(wd) : '0000000'}</span><span class="field-help">Matched to the date</span></div>`;
    } else {
      const btns = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) =>
        `<button type="button" class="dow-btn${s.days[i] ? ' on' : ''}" data-dow="${scope}" data-idx="${i}">${d}</button>`).join('');
      dow = `<div class="dow"><span class="field-label">Days of operation</span><div class="dow-btns">${btns}</div><span class="dow-readout">${daysFromArray(s.days)}</span></div>`;
    }
    rows.push(`<div class="entry-row">${modeToggle}</div>`);
    rows.push(`<div class="entry-row">${dateInputs}</div>`);
    rows.push(`<div class="entry-row">${dow}</div>`);
  } else if (s.kind === 'both') {
    rows.push(`<div class="entry-row">
      ${dateField('Arrival date', scope, 'date', s.date, `gdate-${scope}`, isoToDDMMM(s.date) || 'DDMMM')}
      ${dateField('Departure date', scope, 'dateDep', s.dateDep, `gdatedep-${scope}`, isoToDDMMM(s.dateDep) || 'Often the same day')}
    </div>`);
  } else {
    rows.push(`<div class="entry-row">${dateField('Date', scope, 'date', s.date, `gdate-${scope}`, isoToDDMMM(s.date) || 'DDMMM')}</div>`);
  }

  /* aircraft */
  const acList = isSCR ? 'actypes-iata' : 'actypes-icao';
  const acHelp = isSCR ? '3 chars (IATA), e.g. 320' : '4 chars (ICAO), e.g. C25B';
  rows.push(`<div class="entry-row tight">
    ${field('Seats', inp(scope, 'seats', s.seats, 'inputmode="numeric" maxlength="3" class="mono" placeholder="120"'), 'Auto-padded to 3')}
    ${field('Aircraft type', inp(scope, 'acType', s.acType, `class="mono up" list="${acList}" maxlength="4" placeholder="${isSCR ? '320' : 'C25B'}"`), acHelp)}
  </div>`);

  /* routing + times */
  const aptList = isSCR ? 'airports-iata' : 'airports-icao';
  const route = [];
  if (needArr) {
    route.push(field(`Origin <em>(from)</em>`, inp(scope, 'origin', s.origin, `class="mono up" list="${aptList}" maxlength="4" placeholder="${isSCR ? 'CDG' : 'EDDF'}"`)));
    route.push(field('Arrival time <em>UTC</em>', inp(scope, 'arrTime', s.arrTime, 'inputmode="numeric" maxlength="4" class="mono" placeholder="0700"')));
  }
  if (needDep) {
    route.push(field('Departure time <em>UTC</em>', inp(scope, 'depTime', s.depTime, 'inputmode="numeric" maxlength="4" class="mono" placeholder="0750"')));
    route.push(field(`Destination <em>(to)</em>`, inp(scope, 'dest', s.dest, `class="mono up" list="${aptList}" maxlength="4" placeholder="${isSCR ? 'CDG' : 'EDDM'}"`)));
  }
  rows.push(`<div class="entry-row">${route.join('')}</div>`);

  /* departure day offset / over-midnight (SCR with a departure) */
  if (isSCR && needDep) {
    const cur = String(Number(s.depOffset) || 0);
    const offOpts = [0, 1, 2, 3, 4, 5, 6].map(n =>
      opt(String(n), n === 0 ? 'Same day' : (n === 1 ? '+1 day (overnight)' : `+${n} days`), cur)).join('');
    rows.push(`<div class="entry-row">${field('Departure day <em>(vs arrival)</em>',
      `<select data-scope="${scope}" data-field="depOffset">${offOpts}</select>`,
      'Over-midnight indicator — the date &amp; days always stay on the arrival')}</div>`);
  }

  /* service types */
  if (isSCR) {
    const svc = [];
    if (needArr) svc.push(field('Arrival service', `<select data-scope="${scope}" data-field="arrSvc">${svcOpts(s.arrSvc)}</select>`));
    if (needDep) svc.push(field('Departure service', `<select data-scope="${scope}" data-field="depSvc">${svcOpts(s.depSvc)}</select>`));
    rows.push(`<div class="entry-row">${svc.join('')}</div>`);
  } else {
    const svcRow = [field('Service type', `<select data-scope="${scope}" data-field="svc">${svcOpts(s.svc)}</select>`)];
    if (state.gcrMode === 'FLT')
      svcRow.push(field('Registration ref <em>(RE. — optional)</em>', inp(scope, 'regRef', s.regRef, 'class="mono up" placeholder="OYABC"'), 'Adds “/ RE.reg/” to the line'));
    rows.push(`<div class="entry-row">${svcRow.join('')}</div>`);
  }

  return rows.join('');
}

function renderSlotForms() {
  coerceKinds();
  const isSCR = state.type === 'SCR';
  const kindList = isSCR
    ? [['turnaround', 'Turnaround (arr + dep)'], ['arrival', 'Arrival only'], ['departure', 'Departure only']]
    : [['both', 'Arrival + departure'], ['arrival', 'Arrival only'], ['departure', 'Departure only']];
  const kindOpts = kindList.map(([v, l]) => opt(v, l, state.slot.kind)).join('');

  const movement = `<div class="entry-row tight">${field(isSCR ? 'Movement' : 'Direction',
    `<select data-scope="movement" data-field="kind">${kindOpts}</select>`)}</div>`;

  let html = movement;
  if (state.operation === 'change') {
    html += `
      <div class="slot-group">
        <div class="slot-head"><span class="slot-badge" data-act="C">C</span> Currently held</div>
        ${renderFieldGroup(state.slot, 'slot')}
      </div>
      <div class="slot-group">
        <div class="slot-head"><span class="slot-badge" data-act="R">R</span> New / revised
          <button type="button" class="mini-btn" id="copyHeld" title="Copy every field from the held slot">Copy held &rarr; revised</button>
        </div>
        ${renderFieldGroup(state.revised, 'revised')}
      </div>`;
  } else {
    html += `<div class="slot-group">${renderFieldGroup(state.slot, 'slot')}</div>`;
  }
  $('#slotForms').innerHTML = html;
}

function updatePreview() {
  const text = generate();
  const html = esc(text).replace(/«[^»]*»/g, m => `<span class="ph">${m}</span>`);
  $('#preview').innerHTML = html || '<span class="ph">message preview…</span>';

  const warns = validate();
  const v = $('#validation');
  if (!warns.length) {
    v.innerHTML = `<div class="val-line ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Looks complete — ready to copy into your email.</div>`;
  } else {
    const shown = warns.slice(0, 12).map(msg =>
      `<div class="val-line warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>${esc(msg.charAt(0).toUpperCase() + msg.slice(1))}</div>`).join('');
    const more = warns.length > 12 ? `<div class="val-line warn">+ ${warns.length - 12} more…</div>` : '';
    v.innerHTML = shown + more;
  }
  save();
}

function renderRef() {
  const acts = ACTIONS.filter(a => a.types.includes(state.type))
    .map(a => `<dt>${a.code}</dt><dd>${esc(a.label)}</dd>`).join('');
  const svcs = SERVICE_TYPES[state.type]
    .map(([c, l]) => `<dt>${c}</dt><dd>${esc(l)}</dd>`).join('');
  $('#refBody').innerHTML =
    `<div class="ref-group"><h4>Action codes</h4><dl>${acts}</dl></div>` +
    `<div class="ref-group"><h4>Service types</h4><dl>${svcs}</dl></div>`;
}

function syncHeaderInputs() {
  $('#season').value     = state.header.season;
  $('#msgDate').value    = state.header.msgDate;
  $('#scrAirport').value = state.header.scrAirport;
  $('#creatorRef').value = state.header.creatorRef;
  $('#gcrAirport').value = state.header.gcrAirport;
  $('#si').value         = state.footer.si;
  $('#gi').value         = state.footer.gi;
  $('#msgDatePreview').textContent = isoToDDMMM(state.header.msgDate) || 'DDMMM';
  updateAirportNames();
}

function updateAirportNames() {
  const a1 = airportByIata(clean(state.header.scrAirport));
  $('#scrAirportName').textContent = a1 ? `${a1[2]} (${a1[1]})` : '3-letter IATA code';
  const a2 = airportByIcao(clean(state.header.gcrAirport));
  $('#gcrAirportName').textContent = a2 ? `${a2[2]} (${a2[0]})` : '4-letter ICAO code';
}

function renderAll() {
  renderHeaderVisibility();
  renderOperation();
  syncHeaderInputs();
  renderSlotForms();
  renderRef();
  updatePreview();
}

/* --------------------------------- events --------------------------------- */

function slotInput(ev) {
  const el = ev.target;
  const sc = el.dataset.scope;
  if (sc !== 'slot' && sc !== 'revised') return;
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') return; // handled on change
  state[sc][el.dataset.field] = el.value;
  updatePreview();
}

// refresh date-derived readouts in place, so editing a date never rebuilds the input element
function refreshDateReadouts(scope) {
  const s = state[scope];
  const wdNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dh = document.getElementById('datehint-' + scope);
  if (dh) dh.textContent = isoToDDMMM(s.dateFrom) ? `${isoToDDMMM(s.dateFrom)} (${wdNames[isoWeekday(s.dateFrom)]})` : 'DDMMM';
  const dr = document.getElementById('dowread-' + scope);
  if (dr) {
    const wd = isoWeekday(s.dateFrom);
    dr.textContent = wd ? daysFromWeekday(wd) : '0000000';
    dr.classList.toggle('dim', !wd);
  }
  const gd = document.getElementById('gdate-' + scope);
  if (gd) gd.textContent = isoToDDMMM(s.date) || 'DDMMM';
  const gdd = document.getElementById('gdatedep-' + scope);
  if (gdd) gdd.textContent = isoToDDMMM(s.dateDep) || 'Often the same day';
}

function slotChange(ev) {
  const el = ev.target;
  const sc = el.dataset.scope;
  if (sc === 'movement') {              // structural change: which fields are shown
    state.slot.kind = el.value;
    state.revised.kind = el.value;
    renderSlotForms(); updatePreview(); return;
  }
  if (sc !== 'slot' && sc !== 'revised') return;
  state[sc][el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
  // value-only change (date / service / day-offset): do NOT rebuild the form — rebuilding
  // would destroy the date input mid-edit (the "weird year typing" bug). Update readouts in place.
  if (el.type === 'date') refreshDateReadouts(sc);
  updatePreview();
}

function slotClick(ev) {
  const dm = ev.target.closest('[data-daymode]');
  if (dm) {
    state[dm.dataset.daymode].singleDay = dm.dataset.single === '1';
    renderSlotForms(); updatePreview(); return;
  }
  const dow = ev.target.closest('[data-dow]');
  if (dow) {
    const s = state[dow.dataset.dow];
    s.days[Number(dow.dataset.idx)] = !s.days[Number(dow.dataset.idx)];
    renderSlotForms(); updatePreview(); return;
  }
  if (ev.target.closest('#copyHeld')) {
    copyHeldToRevised(); renderSlotForms(); updatePreview();
  }
}

function wireHeaderFooter() {
  const bind = (id, apply) => {
    const el = $('#' + id);
    el.addEventListener('input', () => { apply(el.value); updatePreview(); });
  };
  bind('season',     v => state.header.season = v);
  bind('creatorRef', v => state.header.creatorRef = v);
  bind('si',         v => state.footer.si = v);
  bind('gi',         v => state.footer.gi = v);
  bind('scrAirport', v => { state.header.scrAirport = v; updateAirportNames(); });
  bind('gcrAirport', v => { state.header.gcrAirport = v; updateAirportNames(); });

  $('#msgDate').addEventListener('change', () => {
    state.header.msgDate = $('#msgDate').value;
    $('#msgDatePreview').textContent = isoToDDMMM(state.header.msgDate) || 'DDMMM';
    if (!RE.season.test(clean(state.header.season))) {
      state.header.season = seasonForIso(state.header.msgDate);
      $('#season').value = state.header.season;
    }
    updatePreview();
  });

  $('#seasonAuto').addEventListener('click', () => {
    const s = seasonForIso(state.header.msgDate);
    if (s) { state.header.season = s; $('#season').value = s; updatePreview(); }
  });
}

function wireSegments() {
  $('#typeSeg').addEventListener('click', ev => {
    const b = ev.target.closest('.seg-btn'); if (!b) return;
    if (state.type === b.dataset.type) return;
    state.type = b.dataset.type;
    coerceKinds();
    renderAll();
  });
  $('#gcrModeSeg').addEventListener('click', ev => {
    const b = ev.target.closest('.seg-btn'); if (!b) return;
    state.gcrMode = b.dataset.mode;
    renderHeaderVisibility(); renderSlotForms(); updatePreview();
  });
  $('#opSeg').addEventListener('click', ev => {
    const b = ev.target.closest('.seg-btn'); if (!b) return;
    const prev = state.operation;
    state.operation = b.dataset.op;
    if (state.operation === 'change' && prev !== 'change') copyHeldToRevised(); // pre-fill revised once
    renderOperation(); renderSlotForms(); updatePreview();
  });
}

function wireClear() {
  $('#clearBtn').addEventListener('click', () => {
    clearSlot();
    renderOperation(); renderSlotForms(); updatePreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function wireToolbar() {
  const copyBtn = $('#copyBtn'), label = $('#copyLabel');
  const iCopy = copyBtn.querySelector('.i-copy'), iCheck = copyBtn.querySelector('.i-check');
  copyBtn.addEventListener('click', async () => {
    const text = generate();
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
    label.textContent = 'Copied'; iCopy.classList.add('hidden'); iCheck.classList.remove('hidden');
    setTimeout(() => { label.textContent = 'Copy'; iCopy.classList.remove('hidden'); iCheck.classList.add('hidden'); }, 1600);
  });

  $('#downloadBtn').addEventListener('click', () => {
    const apt = state.type === 'SCR' ? clean(state.header.scrAirport) : clean(state.header.gcrAirport);
    const blob = new Blob([generate()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.type}_${apt || 'message'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function wireTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem('nordic-slot-tool/theme');
  if (saved) root.dataset.theme = saved;
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';
  $('#themeToggle').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('nordic-slot-tool/theme', root.dataset.theme);
  });
}

function populateDatalists() {
  $('#airports-iata').innerHTML = AIRPORTS.map(a => `<option value="${a[0]}">${esc(a[2])}</option>`).join('');
  $('#airports-icao').innerHTML = AIRPORTS.map(a => `<option value="${a[1]}">${esc(a[2])}</option>`).join('');
  $('#actypes-iata').innerHTML  = ACTYPES_IATA.map(c => `<option value="${c}"></option>`).join('');
  $('#actypes-icao').innerHTML  = ACTYPES_ICAO.map(c => `<option value="${c}"></option>`).join('');
}

/* ---------------------------------- init ---------------------------------- */

function init() {
  wireTheme();
  populateDatalists();

  if (!load()) {
    const today = new Date();
    const iso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    state.header.msgDate = iso;
    state.header.season = seasonForIso(iso);
  }

  const forms = $('#slotForms');
  forms.addEventListener('input', slotInput);
  forms.addEventListener('change', slotChange);
  forms.addEventListener('click', slotClick);

  wireHeaderFooter();
  wireSegments();
  wireClear();
  wireToolbar();

  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

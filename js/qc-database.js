// The one "is there a usable number here" check. Empty, null, undefined and NaN are not numbers.
function hasNumber(v) {
  return v !== null && v !== undefined && v !== "" && !isNaN(v);
}
function isPositiveNumber(v) { return hasNumber(v) && Number(v) > 0; }
function isZeroOrMore(v) { return hasNumber(v) && Number(v) >= 0; }
function roundHalfToEven(value, decimals = 3) {
  if (!hasNumber(value)) return null;
  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  const sign = Math.sign(scaled);
  const absScaled = Math.abs(scaled);
  const integerPart = Math.floor(absScaled);
  const remainder = absScaled - integerPart;
  let rounded;
  if (Math.abs(remainder - 0.5) < 1e-9) {
    rounded = (integerPart % 2 === 0) ? integerPart : integerPart + 1;
  } else {
    rounded = Math.round(absScaled);
  }
  return (rounded * sign) / factor;
}
// Text typed by the person (job names, plant names...) is shown through innerHTML in places; escape it first.
function escapeHtml(text) {
  return String(text === null || text === undefined ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function createOverridable(initialAuto = null) {
  return { auto: initialAuto, manual: null, isManual: false };
}
function resolve(field) {
  if (field && typeof field === "object" && "auto" in field) {
    if (field.isManual && field.manual !== null && field.manual !== "") {
      return field.manual;
    }
    return field.auto;
  }
  return field;
}
function formatValue(field, decimals) {
  const val = resolve(field);
  if (!hasNumber(val)) return "--";
  return Number(val).toFixed(decimals);
}
function createDatabase(model) {
  const rootCollection = model && model.rootCollection ? model.rootCollection : "records";
  return { [rootCollection]: {} };
}
function createDatabaseRecord(parent, collection, id, record) {
  if (!parent || !collection || id === null || id === undefined) return null;
  if (!parent[collection] || typeof parent[collection] !== "object") parent[collection] = {};
  parent[collection][id] = record;
  return record;
}
// Make a new, empty record for a test straight from its definition (TestDefinitions[type]), so the
// definition is the only place a record's shape is written down:
//   input step          -> null          computed step  -> an overridable value
//   choice step         -> what its source policy calls an empty choice
//   datetime step       -> now, with its "automatic" flag set (and the time it was created, when it keeps one)
//   fetched step        -> also the bookkeeping fields its source policy stores (storeKeys)
//   `home` step         -> nothing: that value lives on an ancestor, not on this record
//   step with autoFill  -> autoFill.value(record, parent), after the defaults (e.g. the next number in a series)
// `database` on the definition says where the record goes and how its id looks:
//   { parent, collection, idKey, idPrefix?, idPad?, defaults? }  (defaults = fields every new record starts with)
function createTestRecord(type, parent, overrides = {}) {
  const definition = TestDefinitions[type];
  const database = definition.database;
  const now = getIsoTimestamp();
  const number = nextNumber(parent[database.collection]);
  const id = database.idPrefix
    ? database.idPrefix + String(number).padStart(database.idPad || 0, "0")
    : String(number);
  const record = { [database.idKey]: id };
  definition.sequence.forEach(step => {
    if (step.home) return;
    if (step.type === "computed") {
      record[step.key] = createOverridable();
    } else if (step.type === "choice") {
      record[step.key] = SourceResolvers[step.resolver].emptyChoice();
    } else if (step.type === "datetime") {
      record[step.key] = now;
      if (step.autoKey) record[step.autoKey] = true;
      if (step.autoValueKey) record[step.autoValueKey] = now;
    } else {
      record[step.key] = null;
    }
    const resolver = step.fetch && SourceResolvers[step.fetch];
    if (resolver) resolver.storeKeys.forEach(key => { record[key] = null; });
  });
  Object.assign(record, database.defaults, overrides);
  applyAutoFill(type, record, parent);
  return createDatabaseRecord(parent, database.collection, id, record);
}
// Steps with `autoFill: { when: [keys], value(record, parent) }` are filled in when the record is made, and again
// when one of `when` changes (changedKey); otherwise they are ordinary fields the person can type over.
function applyAutoFill(type, record, parent, changedKey = null) {
  TestDefinitions[type].sequence.forEach(step => {
    if (step.autoFill && (changedKey === null || step.autoFill.when.includes(changedKey))) record[step.key] = step.autoFill.value(record, parent);
  });
}
function getIsoTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
// Next number for a collection: one past the highest number already used (count+1 would collide after a delete).
function nextNumber(collection) {
  let max = 0;
  Object.keys(collection || {}).forEach(id => {
    const m = String(id).match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max + 1;
}

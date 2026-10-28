function roundHalfToEven(value, decimals = 3) {
  if (value === null || value === undefined || isNaN(value)) return null;
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
const DATA_TYPES = {
  MASS:    { decimals: 1, unit: "g",   step: "0.1" },
  VOLUME:  { decimals: 1, unit: "cm³", step: "0.1" },
  GRAVITY: { decimals: 3, unit: "",    step: "0.001" },
  PERCENT: { decimals: 1, unit: "%",   step: "0.1" }
};
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
  if (val === null || val === undefined || isNaN(val)) return "--";
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

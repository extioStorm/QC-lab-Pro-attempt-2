// @ts-nocheck
/* =========================================================================
   SOURCE POLICIES - GENERIC (js/qc-policies.js)

   Reusable rules for "where does this value come from?":
     createParentPickerPolicy    - take the value from a record in the same parent
                                   (1 candidate = automatic, several = the user picks)
     createLatestRecordPolicy    - take the value from the closest record in an ancestor's
                                   collection (before or after reference time), or user choice
     createTimeProximityPolicy   - take the value from the record closest to target time
                                   (my time - an offset) among an ancestor's records,
                                   else a fallback value; never guess between equals

   Every policy also states where it keeps its own bookkeeping on a record (storeKeys) and what an empty
   choice looks like (emptyChoice), so a new record can be built from its test definition alone
   (createTestRecord in qc-database.js).

   Nothing here knows about any particular industry: keys, levels and wording all
   come from the PolicyConfigs the domain module defines (modules/asphalt/asphalt-policies.js), which must load first.
   ========================================================================= */

const MS_PER_MINUTE = 60000;

function parseLocalTime(text) {
  if (!text) return null;
  const ms = new Date(text).getTime();
  return isNaN(ms) ? null : ms;
}

function shortStamp(text) {
  return text ? String(text).slice(5).replace("T", " ") : "--";
}

/* -------------------------------------------------------------------------
   POLICY 1: Pick from the same parent (e.g. a record reads a value from a sibling record in the same parent)
   ------------------------------------------------------------------------- */
function createParentPickerPolicy(config) {
  function resolveTarget(ctx) {
    const parentObj = ctx[config.parent];
    const items = parentObj ? Object.values(parentObj[config.collection] || {}) : [];
    const chosenId = ctx.record ? ctx.record[config.choiceKey] : null;
    let target = null, status = "none";
    if (items.length === 1) { target = items[0]; status = "auto"; }
    else if (items.length > 1 && chosenId && parentObj[config.collection][chosenId]) { target = parentObj[config.collection][chosenId]; status = "picked"; }
    else if (items.length > 1) status = "choose";
    return { items, target, status };
  }

  return {
    storeKeys: [],
    emptyChoice: () => null,
    view(ctx) {
      const { items, target, status } = resolveTarget(ctx);
      const options = [], lines = [];

      if (items.length === 0) {
        lines.push({ text: `No ${config.label} in this ${config.parent} yet.`, tone: "warn" });
        return { options, lines };
      }
      if (items.length >= 2) {
        const activeId = target ? String(target[config.idKey]) : "";
        options.push({ value: "", label: "— Choose —", selected: activeId === "" });
        items.forEach(it => {
          const v = resolve(it[config.valueKey]);
          options.push({
            value: String(it[config.idKey]),
            label: `${config.label} #${it[config.idKey]} · ${isPositiveNumber(v) ? Number(v).toFixed(config.decimals) : "no result yet"}`,
            selected: activeId === String(it[config.idKey])
          });
        });
      }
      if (status === "choose") {
        lines.push({ text: `Multiple ${config.label}s found. Choose which one to use.`, tone: "warn" });
      } else if (target) {
        const v = resolve(target[config.valueKey]);
        if (!isPositiveNumber(v)) lines.push({ text: `${config.label} #${target[config.idKey]} has no result yet.`, tone: "warn" });
        else if (status === "auto") lines.push({ text: `Using ${config.label} #${target[config.idKey]} (${Number(v).toFixed(config.decimals)}).`, tone: "ok" });
      }
      if (config.resultKey && ctx.record && ctx.record[config.resultKey] && ctx.record[config.resultKey].isManual) {
        lines.push({ text: "Hand-typed override is ON — the choice above is ignored.", tone: "warn" });
      }
      return { options, lines };
    },

    value(ctx) {
      const { target } = resolveTarget(ctx);
      if (!target) return null;
      const v = resolve(target[config.valueKey]);
      return isPositiveNumber(v) ? Number(v) : null;
    },

    isFedBy(ctx, providerRecord, providerCtx) {
      return ctx[config.parent] === providerCtx[config.parent];
    },

    locate(ctx) {
      const { items, target } = resolveTarget(ctx);
      if (!items.length) return { level: config.parent, testType: config.testType, id: null, label: `Add ${config.label}`, message: `No ${config.label} in this ${config.parent} yet.` };
      if (!target) return null;
      const noResult = !isPositiveNumber(resolve(target[config.valueKey]));
      return { level: config.parent, testType: config.testType, id: target[config.idKey], label: `Open ${config.label} #${target[config.idKey]}`, message: noResult ? `${config.label} #${target[config.idKey]} has no result yet.` : null };
    },

    apply(ctx, value) {
      if (ctx.record) ctx.record[config.choiceKey] = value || null;
    }
  };
}

/* -------------------------------------------------------------------------
   POLICY 2: Closest record in time to (my time - offset), else fallback
   ------------------------------------------------------------------------- */
function createTimeProximityPolicy(config) {
  const L = config.labels, keys = config.matchStoreKeys, d = config.decimals;

  function resolveMatch(ctx) {
    const rec = ctx.record, owner = ctx[config.ancestor], fallback = ctx[config.fallbackLevel];
    const myTime = parseLocalTime(rec ? rec[config.myTimestampKey] : null);
    const offsetMin = (owner && isZeroOrMore(owner[config.offsetMinutesKey])) ? Number(owner[config.offsetMinutesKey]) : 0;
    const targetMs = myTime !== null ? myTime - offsetMin * MS_PER_MINUTE : null;
    const fallbackVal = (fallback && isPositiveNumber(fallback[config.fallbackKey])) ? Number(fallback[config.fallbackKey]) : null;
    const choice = (rec && rec[config.choiceKey]) || { mode: "auto" };

    const candidates = [];
    Object.values((owner && owner[config.itemsCollection]) || {}).forEach(item => {
      const timeMs = parseLocalTime(item[config.timestampKey]);
      Object.values(item[config.subCollection] || {}).forEach(sub => {
        const val = resolve(sub[config.valueKey]);
        const diffMs = (timeMs !== null && targetMs !== null) ? Math.abs(timeMs - targetMs) : Infinity;
        if (isPositiveNumber(val)) {
          candidates.push({
            parentId: item[config.parentItemKey],
            subId: sub[config.idKey],
            stamp: item[config.timestampKey],
            val: Number(val),
            diffMs,
            diffMin: Math.round(diffMs / MS_PER_MINUTE)
          });
        }
      });
    });

    candidates.sort((a, b) => a.diffMs - b.diffMs);
    const suggested = candidates[0] || null;

    let picked = null, out = null;
    if (choice.mode === "design" || choice.mode === "fallback") {
      out = fallbackVal;
    } else if (choice.mode === "pick") {
      picked = candidates.find(c => String(c.parentId) === String(choice.parentId) && String(c.subId) === String(choice.subId)) || null;
      out = picked ? picked.val : fallbackVal;
    } else if (suggested) {
      picked = suggested;
      out = suggested.val;
    } else {
      out = fallbackVal;
    }

    return { targetMs, fallbackVal, choice, candidates, suggested, picked, out };
  }

  return {
    storeKeys: Object.values(keys || {}),
    emptyChoice: () => ({ mode: "auto", parentId: null, subId: null }),
    view(ctx) {
      const { targetMs, fallbackVal, choice, candidates, suggested, picked } = resolveMatch(ctx);
      const options = [], lines = [];
      const targetStr = targetMs ? shortStamp(getIsoTimestamp(new Date(targetMs))) : "--";
      lines.push({ text: `Target time for ${L.item}: ${targetStr} (${L.event} − ${L.offset}).`, tone: "" });

      const autoText = suggested
        ? `Auto: ${L.item} @ ${shortStamp(suggested.stamp)} · #${suggested.subId}`
        : (fallbackVal ? `Auto: Design (${fallbackVal.toFixed(d)})` : "Auto: None available");
      const activeVal = choice.mode === "pick"
        ? `P::${choice.parentId}::${choice.subId}`
        : (choice.mode === "design" ? "design" : "auto");

      options.push({ value: "auto", label: autoText, selected: activeVal === "auto" });
      candidates.forEach(c => {
        const valStr = `P::${c.parentId}::${c.subId}`;
        options.push({
          value: valStr,
          label: `${L.item} @ ${shortStamp(c.stamp)} · #${c.subId} · ${c.val.toFixed(d)} (${c.diffMin}m away${c === suggested ? " ★" : ""})`,
          selected: activeVal === valStr
        });
      });
      if (fallbackVal !== null) {
        options.push({ value: "design", label: `${L.fallback} (${fallbackVal.toFixed(d)})`, selected: activeVal === "design" });
      }

      if (picked) lines.push({ text: `Using ${L.sub} #${picked.subId} (${picked.val.toFixed(d)}).`, tone: "ok" });
      else if (fallbackVal !== null) lines.push({ text: `Using ${L.fallback} fallback (${fallbackVal.toFixed(d)}).`, tone: "warn" });

      return { options, lines };
    },

    value(ctx) {
      if (!ctx.record) return null;
      const res = resolveMatch(ctx);
      if (keys) {
        ctx.record[keys.parentId] = res.picked ? res.picked.parentId : null;
        ctx.record[keys.id] = res.picked ? res.picked.subId : null;
      }
      return res.out;
    },

    isFedBy(ctx, providerRecord, providerCtx) {
      return ctx[config.ancestor] === providerCtx[config.ancestor];
    },

    locate(ctx) {
      const res = resolveMatch(ctx);
      if (!res.picked) return null;
      const owner = ctx[config.ancestor];
      const item = Object.values((owner && owner[config.itemsCollection]) || {})
        .find(it => String(it[config.parentItemKey]) === String(res.picked.parentId));
      return item ? {
        level: config.itemLevel,
        ctx: Object.assign({}, ctx, { [config.itemLevel]: item }),
        testType: config.subTestType,
        id: res.picked.subId,
        label: `Open ${L.sub} #${res.picked.subId}`,
        message: null
      } : null;
    },

    apply(ctx, value) {
      if (!ctx.record) return;
      if (value === "auto" || value === "design" || value === "fallback") {
        ctx.record[config.choiceKey] = { mode: value, parentId: null, subId: null };
      } else if (value.startsWith("P::")) {
        const [, pId, sId] = value.split("::");
        ctx.record[config.choiceKey] = { mode: "pick", parentId: pId, subId: sId };
      }
    }
  };
}

/* -------------------------------------------------------------------------
   POLICY 3: Closest record in time (before or after), or technician choice
   ------------------------------------------------------------------------- */
function createLatestRecordPolicy(config) {
  const L = config.labels || {};

  function refMsOf(ctx) {
    return ctx[config.refTime.level] ? parseLocalTime(ctx[config.refTime.level][config.refTime.key]) : null;
  }

  function pick(ctx) {
    const owner = ctx[config.ancestor];
    const refMs = refMsOf(ctx);
    const chosenId = (config.matchStoreKey && ctx.record) ? ctx.record[config.matchStoreKey] : null;

    const all = Object.values((owner && owner[config.collection]) || {})
      .map(rec => ({ rec, id: rec[config.idKey], ms: parseLocalTime(rec[config.timeKey]), val: rec[config.valueKey] }))
      .filter(c => c.ms !== null && (config.allowZero ? isZeroOrMore(c.val) : isPositiveNumber(c.val)));

    if (!all.length) return { best: null, all: [], manualChoice: false };

    // 1. If technician explicitly chose a specific calibration ID, honor it
    if (chosenId && chosenId !== "auto") {
      const explicit = all.find(c => String(c.id) === String(chosenId));
      if (explicit) return { best: explicit, all, manualChoice: true };
    }

    // 2. Otherwise, auto-select the closest in time (before OR after reference time)
    const sorted = [...all].sort((a, b) => {
      if (refMs === null) return b.ms - a.ms;
      const diffA = Math.abs(a.ms - refMs);
      const diffB = Math.abs(b.ms - refMs);
      return diffA - diffB;
    });

    return { best: sorted[0], all, manualChoice: false };
  }

  return {
    storeKeys: config.matchStoreKey ? [config.matchStoreKey] : [],
    emptyChoice: () => null,
    view(ctx) {
      const { best, all, manualChoice } = pick(ctx);
      const options = [], lines = [];

      if (all.length > 1) {
        options.push({ value: "auto", label: `Auto (closest: #${best ? best.id : "--"})`, selected: !manualChoice });
        all.forEach(c => {
          options.push({
            value: String(c.id),
            label: `${L.item || "Record"} #${c.id} @ ${shortStamp(c.rec[config.timeKey])}`,
            selected: manualChoice && String(c.id) === String(best ? best.id : "")
          });
        });
      }

      if (best) {
        lines.push({ text: `Using ${L.item || "record"} #${best.id} @ ${shortStamp(best.rec[config.timeKey])}.`, tone: "ok" });
      } else {
        lines.push({ text: L.missing || "No record on file.", tone: "warn" });
      }

      return { options, lines };
    },

    value(ctx) {
      const record = ctx.record;
      if (!record) return null;
      const { best } = pick(ctx);
      if (config.matchStoreKey) {
        record[config.matchStoreKey] = best ? best.id : null;
      }
      return best ? Number(best.val) : null;
    },

    isFedBy(ctx, providerRecord, providerCtx) {
      return ctx[config.ancestor] === providerCtx[config.ancestor];
    },

    apply(ctx, value) {
      if (!ctx.record || !config.matchStoreKey) return;
      ctx.record[config.matchStoreKey] = (value === "auto" || !value) ? null : value;
    },

    locate(ctx) {
      const { best } = pick(ctx);
      if (!best) {
        return {
          level: config.ancestor,
          testType: config.testType,
          id: null,
          label: `Add ${L.item}`,
          message: L.missing
        };
      }
      return {
        level: config.ancestor,
        testType: config.testType,
        id: best.id,
        label: `Open ${L.item} #${best.id} (${shortStamp(best.rec[config.timeKey])})`,
        message: null
      };
    }
  };
}

/* -------------------------------------------------------------------------
   Build the resolvers the screens and engine use, from the domain's PolicyConfigs.
   ------------------------------------------------------------------------- */
const POLICY_TYPES = {
  parentPicker: createParentPickerPolicy,
  latestRecord: createLatestRecordPolicy,
  timeProximity: createTimeProximityPolicy
};

const SourceResolvers = Object.fromEntries(
  Object.entries(typeof PolicyConfigs === "object" ? PolicyConfigs : {})
    .map(([name, config]) => [name, POLICY_TYPES[config.policy](config)])
);
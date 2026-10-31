//@ts-nocheck
const STORAGE_DB_KEY = DatabaseMap.storage.databaseKey;
const STORAGE_NAV_KEY = DatabaseMap.storage.navigationKey;
const NO_ACTIVE_TEST = { activeTestType: null, activeTestId: null };
const Nav = { mode: "SPEED" };
// The Nav key that holds the selected id at a level.
function navKeyOf(level) {
  const definition = DatabaseMap.entities[level] || {};
  return definition.navKey || `${level}Id`;
}
function clearActiveTest() { Object.assign(Nav, NO_ACTIVE_TEST); }
// Nothing selected at any level, no test open.
function clearSelection() {
  Object.keys(DatabaseMap.entities).forEach(level => { Nav[navKeyOf(level)] = null; });
  clearActiveTest();
  Nav.stepIndex = 0;
}
clearSelection();
let appDb = (typeof createDatabase === "function") ? createDatabase(DatabaseMap) : {};
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_DB_KEY, JSON.stringify(appDb));
    localStorage.setItem(STORAGE_NAV_KEY, JSON.stringify(Nav));
  } catch (e) {
    console.warn("Storage save failed:", e);
  }
}
function loadFromStorage() {
  try {
    const rawDb = localStorage.getItem(STORAGE_DB_KEY);
    const rawNav = localStorage.getItem(STORAGE_NAV_KEY);
    if (rawDb) appDb = JSON.parse(rawDb);
    if (rawNav) Object.assign(Nav, JSON.parse(rawNav));
    // A saved screen that no longer exists (renamed or removed) falls back to the landing page.
    if (Nav.activeTestType && !DatabaseMap.tests[Nav.activeTestType] && !(DatabaseMap.views || {})[Nav.activeTestType]) clearActiveTest();
  } catch (e) {
    console.warn("Storage load failed:", e);
  }
}
function resetDatabase() {
  if (!confirm("Are you sure you want to wipe all stored data and start fresh?")) return;
  localStorage.removeItem(STORAGE_DB_KEY);
  localStorage.removeItem(STORAGE_NAV_KEY);
  appDb = createDatabase(DatabaseMap);
  clearSelection();
  toggleDrawer(false);
  renderScreen();
}
function initDefaultData() {
  loadFromStorage();
}
function getActiveContext() {
  const ctx = { record: null };
  Object.keys(DatabaseMap.entities).forEach(type => { ctx[type] = null; });
  let level = DatabaseMap.rootEntity;
  let collection = appDb && appDb[DatabaseMap.rootCollection];
  while (level && collection) {
    const definition = DatabaseMap.entities[level];
    if (!definition) break;
    const id = Nav[navKeyOf(level)];
    if (id === null || id === undefined) break;
    const record = collection[id];
    if (!record) break;
    ctx[level] = record;
    const possibleChildren = (DatabaseMap.tree[level] && DatabaseMap.tree[level].holds || []).filter(hold => hold.node);
    const next = possibleChildren.find(hold => {
      const child = DatabaseMap.entities[hold.node];
      return child && Nav[navKeyOf(hold.node)] !== null;
    });
    if (!next) break;
    collection = record[next.collection];
    level = next.node;
  }
  const testDefinition = DatabaseMap.tests[Nav.activeTestType];
  if (testDefinition && Nav.activeTestId) {
    const parent = ctx[testDefinition.parent];
    const collection = parent && parent[testDefinition.collection];
    ctx.record = collection ? collection[Nav.activeTestId] || null : null;
  }
  return ctx;
}
function getActiveRecord()  { return getActiveContext().record; }
function getStepHome(step) {
  const ctx = getActiveContext();
  if (step && step.home && ctx[step.home]) return ctx[step.home];
  return ctx.record;
}
// A step of the test on screen.
function findStep(key) { return stepOf(Nav.activeTestType, key); }
function navigateTo(target, { keepDrawer = false } = {}) {
  Object.assign(Nav, target);
  if (!keepDrawer) toggleDrawer(false);
  saveToStorage();
  renderScreen();
}

// Where a step is drawn on the Speed Sheet: its row, and its calculated-value element when it has one.
function findStepElements(stepKey) {
  const rows = [...document.querySelectorAll("[data-step-row]")].filter(el => el.dataset.stepRow === stepKey);
  const calc = [...document.querySelectorAll("[data-calc]")].find(el => el.getAttribute("data-calc") === stepKey) || null;
  const calcRow = calc && calc.closest("[data-step-row]");
  const row = (calcRow && rows.includes(calcRow))
    ? calcRow
    : (rows.find(el => el.querySelector("input, select, textarea")) || rows[0] || null);
  return { row, calc };
}

// Take the technician to a step of the test on screen: the Speed Sheet, every accordion around the row
// opened, the row scrolled into view, and an input focused. Returns what it found (see findStepElements),
// so a caller can go further, or null when the test on screen has no such step.
function jumpToStep(stepKey) {
  const step = findStep(stepKey);
  if (!step) return null;
  navigateTo({ mode: "SPEED", stepIndex: 0 });
  const found = findStepElements(stepKey);
  for (let parent = found.row && found.row.parentElement; parent; parent = parent.parentElement) {
    if (parent.matches("details")) parent.open = true;
  }
  if (found.row) found.row.scrollIntoView({ behavior: "smooth", block: "center" });
  if (step.type !== "computed" && found.row) {
    const control = found.row.querySelector("input, select, textarea");
    if (control) control.focus({ preventScroll: true });
  }
  return found;
}

// Follow a dependency route (the chain of steps from buildDependencyTrace) to the test that owns its end.
// Each time the chain crosses into another test, go to the record that value is fetched from.
// Returns true when we end up on the test the route leads to, false when a source record cannot be found.
function followDependencyRoute(route, targetType) {
  for (const edge of route) {
    if (edge.fromType === edge.toType) continue;
    const consumerStep = findStep(edge.fromKey);
    const resolver = consumerStep && consumerStep.fetch && SourceResolvers[consumerStep.fetch];
    const context = getActiveContext();
    const where = resolver && resolver.locate ? resolver.locate(context) : null;
    if (!where) return false;
    goToSource(where, context);
  }
  return Nav.activeTestType === targetType;
}

// "Select this record at this level": its id, plus whatever the tree config says to reset below it (clearNav).
function selectionTarget(level, id) {
  const def = DatabaseMap.entities[level];
  const hold = Object.values(DatabaseMap.tree).flatMap(node => node.holds).find(h => h.node === level);
  const target = { [navKeyOf(level)]: id };
  ((hold && hold.navigation && hold.navigation.clearNav) || []).forEach(key => { target[key] = null; });
  return target;
}
// The Nav ids of the levels above `stopAtLevel` (all selected levels when null).
function contextIds(ctx, stopAtLevel) {
  const ids = {};
  for (const [level, def] of Object.entries(DatabaseMap.entities)) {
    if (level === stopAtLevel || !ctx[level]) break;
    ids[navKeyOf(level)] = ctx[level][def.idKey];
  }
  return ids;
}
// The deepest level currently selected (null when nothing is).
function deepestLevel(ctx) {
  return Object.keys(DatabaseMap.entities).filter(level => ctx[level]).pop() || null;
}
// Where a level's records live: the object holding them, the collection name, and the config to add another.
function parentRefOf(level, ctx) {
  if (level === DatabaseMap.rootEntity) return { parent: appDb, collection: DatabaseMap.rootCollection, relation: DatabaseMap.rootNavigation };
  const parentLevel = Object.keys(DatabaseMap.tree).find(l => DatabaseMap.tree[l].holds.some(h => h.node === level));
  const hold = DatabaseMap.tree[parentLevel].holds.find(h => h.node === level);
  return { parent: ctx[parentLevel], collection: hold.collection, relation: hold.navigation };
}
// Take the user to the record a value comes from (creating it first when none exists yet).
function goToSource(where, ctx) {
  const here = where.ctx || ctx;
  const test = DatabaseMap.tests[where.testType];
  let id = where.id;
  if (id === null || id === undefined) {
    const created = test.create(here[where.level]);
    if (!created) return;
    id = created[test.idKey];
  }
  const target = selectionTarget(where.level, here[where.level][DatabaseMap.entities[where.level].idKey]);
  navigateTo(Object.assign(target, { activeTestType: where.testType, activeTestId: id, stepIndex: 0 }));
}
function setMode(newMode) {
  Nav.mode = newMode;
  saveToStorage();
  renderScreen();
}
function toggleDrawer(open) {
  const drawer = document.getElementById("nav-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (!drawer || !overlay) return;
  const isOpen = (open !== undefined) ? open : !drawer.classList.contains("open");
  if (isOpen) {
    renderDrawerContent();
    drawer.classList.add("open");
    overlay.classList.add("open");
  } else {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
  }
}
function createTreeRow({ icon, title, isLeaf = false, isActive = false, isOpen = false, getChildren = null, onSelect = null, isAddAction = false, onFocus = null }) {
  const container = document.createElement("div");
  container.className = isAddAction ? "tree-node tree-add-node" : "tree-node";
  const row = document.createElement("div");
  row.className = `tree-row ${isActive ? "active" : ""} ${isAddAction ? "tree-add-btn" : ""}`;
  row.innerHTML = `
    <span class="tree-arrow">${isLeaf ? "•" : (isOpen ? "▼" : "▶")}</span>
    <span class="tree-icon">${icon}</span>
    <span class="tree-title">${escapeHtml(title)}</span>
  `;
  const childContainer = document.createElement("div");
  childContainer.className = "tree-children";
  if (!isLeaf && isOpen) {
    container.classList.add("is-open");
    childContainer.style.display = "block";
    if (getChildren) getChildren(childContainer);
  }
  row.onclick = () => {
    if (isLeaf) {
      if (onSelect) onSelect();
      return;
    }
    if (onFocus) onFocus();
    const currentlyOpen = childContainer.style.display === "block";
    if (currentlyOpen) {
      container.classList.remove("is-open");
      container.querySelectorAll(".is-open").forEach(el => el.classList.remove("is-open"));
      childContainer.style.display = "none";
      row.querySelector(".tree-arrow").textContent = "▶";
    } else {
      container.classList.add("is-open");
      childContainer.innerHTML = "";
      childContainer.style.display = "block";
      row.querySelector(".tree-arrow").textContent = "▼";
      if (getChildren) getChildren(childContainer);
    }
  };
  container.append(row, childContainer);
  return container;
}
function getNodeTitle(type, obj, id) {
  const definition = DatabaseMap.entities[type] || DatabaseMap.tests[type];
  if (definition && typeof definition.navigationTitle === "function") return definition.navigationTitle(obj, id);
  const title = definition && definition.titleKey ? obj[definition.titleKey] : null;
  if (title) return title;
  return id;
}
function getNodeIcon(type) {
  const definition = DatabaseMap.entities[type] || DatabaseMap.tests[type];
  return definition && definition.icon ? definition.icon : (TestDefinitions[type] ? TestDefinitions[type].icon : "📄");
}
function collectNavigationValues(action) {
  const values = {};
  for (const field of action.fields || []) {
    const value = prompt(field.prompt || field.label || "Enter a value:", field.defaultValue || "");
    if (value === null) return null;
    values[field.key] = value.trim();
    if (field.required && !values[field.key]) {
      alert(action.requiredMessage || "Please complete the required fields.");
      return null;
    }
  }
  (action.fields || []).forEach(field => {
    if (!values[field.key] && field.fallbackFrom) values[field.key] = values[field.fallbackFrom] || "";
  });
  return values;
}
function createNavigationChild(action, parent, level) {
  if (!action || typeof action.create !== "function") return;
  const values = collectNavigationValues(action);
  if (values === null) return;
  const record = action.create(parent, values);
  if (!record) return;
  const idKey = action.idKey || (DatabaseMap.entities[level] || {}).idKey;
  if (idKey && record[idKey] !== undefined) Nav[navKeyOf(level)] = record[idKey];
  (action.clearNav || []).forEach(key => { Nav[key] = null; });
  if (action.clearActiveTest) clearActiveTest();
  saveToStorage();
  renderDrawerContent();
}
// Delete one record (and everything inside it), then let the chain reaction clean up whatever pointed at it.
function deleteRecord(parent, collectionName, id, title, keepContext) {
  if (!parent || !parent[collectionName] || !(id in parent[collectionName])) return;
  if (!confirm(`Delete "${title}" and everything inside it? This cannot be undone.`)) return;
  delete parent[collectionName][id];
  Object.values(DatabaseMap.entities).forEach(def => {
    if (def.navKey && !(def.navKey in keepContext)) Nav[def.navKey] = null;
  });
  clearActiveTest();
  try { propagateAll(appDb); } catch (e) { console.warn("Recalculation after delete failed:", e); }
  saveToStorage();
  renderDrawerContent();
  renderScreen();
}
// A test record's name in lists (its definition's itemLabel, else "Title #id").
function testRecordTitle(type, record, id) {
  const definition = TestDefinitions[type], nav = definition.navigation || {};
  return nav.itemLabel ? nav.itemLabel(record, id) : `${definition.title} #${id}`;
}
// Open one record of a test, at its first page. `context` is the Nav ids of the levels above it; `extra` adds
// more Nav settings (a mode, a page).
function openTestRecord(type, id, context, extra = {}) {
  navigateTo(Object.assign({}, context, { activeTestType: type, activeTestId: id, stepIndex: 0 }, extra));
}
// A test record as a tree row (tap opens it). `parentActive`: its parent is the selected record.
function buildTestRecordRow(type, record, context, parentActive = false) {
  const id = record[DatabaseMap.tests[type].idKey];
  return createTreeRow({
    icon: TestDefinitions[type].icon || "📄",
    title: testRecordTitle(type, record, id),
    isLeaf: true,
    isActive: parentActive && Nav.activeTestType === type && Nav.activeTestId === id,
    onSelect: () => openTestRecord(type, id, context)
  });
}
// The row that adds a new record of a test to `parent` and opens it.
function buildTestAddRow(type, parent, context, label) {
  const test = DatabaseMap.tests[type], definition = TestDefinitions[type];
  return createTreeRow({
    icon: "➕",
    title: label || (definition.navigation || {}).addLabel || `Add ${definition.title}`,
    isLeaf: true,
    isAddAction: true,
    onSelect: () => {
      const record = test.create(parent);
      if (!record) return;
      saveToStorage();
      openTestRecord(type, record[test.idKey], context);
    }
  });
}
// The lens: the module's declared workday entries (DatabaseMap.lenses) for the selected `parent`, drawn above
// the tree with the same rows and navigation. Progress is counted from the records every time it is drawn.
function renderLensBlock(container) {
  const lens = Object.values(DatabaseMap.lenses || {})[0];
  const ctx = getActiveContext();
  const scope = lens && ctx[lens.parent];
  if (!scope) return;
  const context = Object.assign(contextIds(ctx, lens.parent), selectionTarget(lens.parent, scope[DatabaseMap.entities[lens.parent].idKey]));
  const win = currentWindow(scope, lens.window);
  const windowTest = DatabaseMap.tests[lens.window.type];
  container.appendChild(createTreeRow({
    icon: lens.icon || "📋",
    title: win ? `${lens.label} · ${testRecordTitle(lens.window.type, win.record, win.record[windowTest.idKey])}` : lens.label,
    isOpen: true,
    getChildren: rows => {
      if (!win) { rows.appendChild(buildTestAddRow(lens.window.type, scope, context, lens.startLabel)); return; }
      const numbers = new Map(lens.groups.flatMap(group => group.entries).map((entry, i) => [entry, i + 1]));
      lens.groups.forEach(group => rows.appendChild(createTreeRow({
        icon: group.icon || "📂",
        title: group.label,
        isOpen: true,
        getChildren: groupRows => group.entries.forEach(entry => groupRows.appendChild(buildLensEntryRow(entry, `${numbers.get(entry)}. ${entry.label}`, lens, scope, win, context, ctx)))
      })));
    }
  }));
}
// One lens entry: a section of the day's window record (filled/total), records in the window that still need
// something (done/total; opens the first not done), or the window's records with the add action.
function buildLensEntryRow(entry, title, lens, scope, win, context, ctx) {
  const mark = done => (done ? "✅" : "▫️");
  if (entry.section) {
    const type = lens.window.type;
    // Only the steps that matter count; optional ones (the toolbox) never make a section unfinished.
    const steps = TestDefinitions[type].sequence.filter(step => step.section === entry.section && step.type !== "computed" && !step.optional);
    const filled = steps.filter(step => isStepFilled(type, win.record, ctx, step)).length;
    const warning = entry.warn ? recordsInWindow(lens.parent, scope, entry.warn, win).notDone.length : 0;
    return createTreeRow({
      icon: steps.length ? mark(filled === steps.length) : "🧰",
      title: `${title}${steps.length ? ` · ${filled}/${steps.length}` : ""}${warning ? ` · ⚠ ${entry.warn.warnLabel}: ${warning}` : ""}`,
      isLeaf: true,
      onSelect: () => openTestRecord(type, win.record[DatabaseMap.tests[type].idKey], context, {
        mode: "INTERACTIVE",
        stepIndex: Math.max(0, stepSections(TestDefinitions[type]).findIndex(section => section.name === entry.section))
      })
    });
  }
  const type = entry.records, test = DatabaseMap.tests[type];
  const { records, notDone } = recordsInWindow(lens.parent, scope, entry, win);
  // The Nav ids that open a record found under the lens's scope (it may sit under any mix / plant).
  const contextOf = recordCtx => Object.assign(contextIds(recordCtx, null), selectionTarget(test.parent, recordCtx[test.parent][DatabaseMap.entities[test.parent].idKey]));
  if (entry.doneKey) {
    return createTreeRow({
      icon: mark(records.length && !notDone.length),
      title: `${title} · ${records.length - notDone.length} of ${records.length} ${entry.doneLabel}`,
      isLeaf: true,
      onSelect: () => { if (notDone.length) openTestRecord(type, notDone[0].record[test.idKey], contextOf(notDone[0].ctx)); }
    });
  }
  return createTreeRow({
    icon: TestDefinitions[type].icon || "📄",
    title: `${title} · ${records.length}`,
    getChildren: rows => {
      records.forEach(found => rows.appendChild(buildTestRecordRow(type, found.record, contextOf(found.ctx), true)));
      // One add row per place the record can go (e.g. each mix's plant), named by the levels in between.
      const parents = collectLevelRecords(lens.parent, scope, test.parent);
      const levels = Object.keys(DatabaseMap.entities);
      parents.forEach(parent => {
        const where = levels.slice(levels.indexOf(lens.parent) + 1, levels.indexOf(test.parent) + 1)
          .map(level => getNodeTitle(level, parent.ctx[level], parent.ctx[level][DatabaseMap.entities[level].idKey])).join(" / ");
        const label = `${(TestDefinitions[type].navigation || {}).addLabel || "Add"}${parents.length > 1 ? ` · ${where}` : ""}`;
        rows.appendChild(buildTestAddRow(type, parent.record, contextOf(parent.ctx), label));
      });
    }
  });
}
function renderRecursiveNode(levelType, obj, id, container, parentContext = {}) {
  const navKey = navKeyOf(levelType);
  const currentContext = Object.assign({}, parentContext, { [navKey]: id });
  const isSelfActive = Nav[navKey] === id;
  const nodeRow = createTreeRow({
    icon: getNodeIcon(levelType),
    title: getNodeTitle(levelType, obj, id),
    isOpen: isSelfActive,
    onFocus: () => navigateTo(Object.assign({}, parentContext, selectionTarget(levelType, id), NO_ACTIVE_TEST), { keepDrawer: true }),
    getChildren: (childEl) => {
      Object.values(DatabaseMap.views || {}).filter(view => view.parent === levelType).forEach(view => {
        const isViewActive = isSelfActive && Nav.activeTestType === view.id;
        childEl.appendChild(createTreeRow({
          icon: view.icon || "📄",
          title: view.navigationLabel || view.cardTitle || view.id,
          isLeaf: true,
          isActive: isViewActive,
          onSelect: () => navigateTo(Object.assign({}, currentContext, { activeTestType: view.id, activeTestId: null }))
        }));
      });
      const schema = DatabaseMap.tree[levelType];
      if (!schema || !schema.holds) return;
      schema.holds.forEach(h => {
        const collectionName = h.collection || (h.test && DatabaseMap.tests[h.test].collection);
        if (h.node) {
          const collectionObj = obj[collectionName] || {};
          const relation = h.navigation || {};
          const childDefinition = DatabaseMap.entities[h.node] || {};
          const activeTest = DatabaseMap.tests[Nav.activeTestType];
          const activeView = (DatabaseMap.views || {})[Nav.activeTestType];
          const childNavKey = navKeyOf(h.node);
          const isHoldActive = Boolean(Nav[childNavKey]) || Boolean(activeTest && activeTest.parent === h.node) || Boolean(activeView && activeView.parent === h.node);
          const renderChildEntries = target => {
            Object.keys(collectionObj).forEach(childId => {
              const record = collectionObj[childId];
              const recordId = record[childDefinition.idKey] || childId;
              renderRecursiveNode(h.node, record, recordId, target, currentContext);
            });
            if (relation.create) {
              target.appendChild(createTreeRow({
                icon: "➕",
                title: relation.addLabel || `Add ${childDefinition.label || h.node}`,
                isLeaf: true,
                isAddAction: true,
                onSelect: () => createNavigationChild(relation, obj, h.node)
              }));
            }
          };
          if (relation.group) {
            childEl.appendChild(createTreeRow({
              icon: relation.groupIcon || getNodeIcon(h.node),
              title: `${relation.groupLabel || childDefinition.label || h.node} (${Object.keys(collectionObj).length})`,
              isOpen: isHoldActive,
              getChildren: renderChildEntries
            }));
          } else {
            renderChildEntries(childEl);
          }
        }
        if (h.test) {
          const testCollection = obj[collectionName] || {};
          const testDef = TestDefinitions[h.test];
          const nav = testDef.navigation || {};
          const isTestGroupActive = isSelfActive && Nav.activeTestType === h.test;
          const renderTestEntries = testContainer => {
            Object.values(testCollection).forEach(record => testContainer.appendChild(buildTestRecordRow(h.test, record, currentContext, isSelfActive)));
            testContainer.appendChild(buildTestAddRow(h.test, obj, currentContext));
          };
          if (nav.group) {
            childEl.appendChild(createTreeRow({
              icon: nav.groupIcon || testDef.icon || "📄",
              title: `${nav.collectionLabel || testDef.title} (${Object.keys(testCollection).length})`,
              isOpen: isTestGroupActive,
              getChildren: renderTestEntries
            }));
          } else {
            renderTestEntries(childEl);
          }
        }
      });
    }
  });
  container.appendChild(nodeRow);
}
function renderDrawerContent() {
  const drawer = document.getElementById("nav-drawer");
  if (!drawer) return;
  drawer.innerHTML = `
    <div class="drawer-header">
      <div>
        <div class="logo">NAVIGATION TREE</div>
        <div class="caption">Active path auto-expanded</div>
      </div>
      <button class="btn-icon" onclick="toggleDrawer(false)">✕</button>
    </div>
    <div class="tree-search-wrap">
      <input type="text" id="tree-search-input" placeholder="🔍 Quick Filter..." oninput="filterTreeNodes(this.value)">
    </div>
    <div id="lens-root" class="lens-root"></div>
    <div id="tree-root"></div>
    <div class="drawer-section">
      <div class="section-label">⚙️ Maintenance & Testing</div>
      <button class="btn-danger btn-small" onclick="resetDatabase()">🗑️ Reset Database (Start Fresh)</button>
    </div>
  `;
  renderLensBlock(document.getElementById("lens-root"));
  const root = document.getElementById("tree-root");
  const rootRecords = appDb[DatabaseMap.rootCollection] || {};
  Object.keys(rootRecords).forEach(rootId => {
    renderRecursiveNode(DatabaseMap.rootEntity, rootRecords[rootId], rootId, root);
  });
  const rootAction = DatabaseMap.rootNavigation;
  root.appendChild(createTreeRow({
    icon: rootAction.icon || "➕",
    title: rootAction.addLabel || "Create",
    isLeaf: true,
    isAddAction: true,
    onSelect: () => createNavigationChild(rootAction, appDb, rootAction.level)
  }));
}
function filterTreeNodes(rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  document.querySelectorAll(".tree-row").forEach(row => {
    if (!q) {
      row.style.display = "flex";
      return;
    }
    const match = row.textContent.toLowerCase().includes(q);
    row.style.display = match ? "flex" : "none";
    if (match) {
      let parent = row.closest(".tree-children");
      while (parent) {
        parent.style.display = "block";
        parent = parent.parentElement.closest(".tree-children");
      }
    }
  });
}
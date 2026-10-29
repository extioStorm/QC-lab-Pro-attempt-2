//@ts-nocheck
const STORAGE_DB_KEY = DatabaseMap.storage.databaseKey;
const STORAGE_NAV_KEY = DatabaseMap.storage.navigationKey;
const Nav = {
  activeTestType: null,
  activeTestId: null,
  mode: "SPEED",
  stepIndex: 0
};
Object.entries(DatabaseMap.entities).forEach(([type, definition]) => {
  Nav[definition.navKey || `${type}Id`] = null;
});
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
  } catch (e) {
    console.warn("Storage load failed:", e);
  }
}
function resetDatabase() {
  if (!confirm("Are you sure you want to wipe all stored data and start fresh?")) return;
  localStorage.removeItem(STORAGE_DB_KEY);
  localStorage.removeItem(STORAGE_NAV_KEY);
  appDb = createDatabase(DatabaseMap);
  Object.entries(DatabaseMap.entities).forEach(([type, definition]) => {
    Nav[definition.navKey || `${type}Id`] = null;
  });
  Object.assign(Nav, {
    activeTestType: null,
    activeTestId: null,
    stepIndex: 0
  });
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
    const id = Nav[definition.navKey || `${level}Id`];
    if (id === null || id === undefined) break;
    const record = collection[id];
    if (!record) break;
    ctx[level] = record;
    const possibleChildren = (DatabaseMap.tree[level] && DatabaseMap.tree[level].holds || []).filter(hold => hold.node);
    const next = possibleChildren.find(hold => {
      const child = DatabaseMap.entities[hold.node];
      return child && Nav[child.navKey || `${hold.node}Id`] !== null;
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
function findStep(key) {
  const def = TestDefinitions[Nav.activeTestType];
  return def ? def.sequence.find(st => st.key === key) || null : null;
}
function navigateTo(target, { keepDrawer = false } = {}) {
  Object.assign(Nav, target);
  if (!keepDrawer) toggleDrawer(false);
  saveToStorage();
  renderScreen();
}

// Jump to an input step of the test on screen (wizard: that step; speed sheet: scroll to its row).
function jumpToStep(stepKey) {
  const def = TestDefinitions[Nav.activeTestType];
  // Match the structural logic of the Wizard UI!
  const mainSteps = def ? def.sequence.filter(s => !s.home && !s.fetch && !s.resolver) : [];
  const index = mainSteps.findIndex(s => s.key === stepKey);
  if (index < 0) return;
  navigateTo({ stepIndex: index });
  const row = document.querySelector(`[data-step-row="${stepKey}"]`);
  if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
}

// "Select this record at this level": its id, plus whatever the tree config says to reset below it (clearNav).
function selectionTarget(level, id) {
  const def = DatabaseMap.entities[level];
  const hold = Object.values(DatabaseMap.tree).flatMap(node => node.holds).find(h => h.node === level);
  const target = { [def.navKey || `${level}Id`]: id };
  ((hold && hold.navigation && hold.navigation.clearNav) || []).forEach(key => { target[key] = null; });
  return target;
}
// The Nav ids of the levels above `stopAtLevel` (all selected levels when null).
function contextIds(ctx, stopAtLevel) {
  const ids = {};
  for (const [level, def] of Object.entries(DatabaseMap.entities)) {
    if (level === stopAtLevel || !ctx[level]) break;
    ids[def.navKey || `${level}Id`] = ctx[level][def.idKey];
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
    <span class="tree-title">${title}</span>
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
  const definition = DatabaseMap.entities[level] || {};
  const idKey = action.idKey || definition.idKey;
  const navKey = definition.navKey || `${level}Id`;
  if (idKey && record[idKey] !== undefined) Nav[navKey] = record[idKey];
  (action.clearNav || []).forEach(key => { Nav[key] = null; });
  if (action.clearActiveTest) {
    Nav.activeTestType = null;
    Nav.activeTestId = null;
  }
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
  Nav.activeTestType = null;
  Nav.activeTestId = null;
  try { propagateAll(appDb); } catch (e) { console.warn("Recalculation after delete failed:", e); }
  saveToStorage();
  renderDrawerContent();
  renderScreen();
}
function renderRecursiveNode(levelType, obj, id, container, parentContext = {}) {
  const entityDefinition = DatabaseMap.entities[levelType] || {};
  const navKey = entityDefinition.navKey || `${levelType}Id`;
  const currentContext = Object.assign({}, parentContext, { [navKey]: id });
  const isSelfActive = Nav[navKey] === id;
  const nodeRow = createTreeRow({
    icon: getNodeIcon(levelType),
    title: getNodeTitle(levelType, obj, id),
    isOpen: isSelfActive,
    onFocus: () => navigateTo(Object.assign({}, parentContext, selectionTarget(levelType, id), { activeTestType: null, activeTestId: null }), { keepDrawer: true }),
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
          const childNavKey = childDefinition.navKey || `${h.node}Id`;
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
          const testMap = DatabaseMap.tests[h.test];
          const nav = testDef.navigation || {};
          const isTestGroupActive = isSelfActive && Nav.activeTestType === h.test;
          const renderTestEntries = testContainer => {
            Object.entries(testCollection).forEach(([storedId, record]) => {
              const testId = record[testMap.idKey] || storedId;
              const isActive = isSelfActive && Nav.activeTestType === h.test && Nav.activeTestId === testId;
              testContainer.appendChild(createTreeRow({
                icon: testDef.icon || "📄",
                title: nav.itemLabel ? nav.itemLabel(record, testId) : `${testDef.title} #${testId}`,
                isLeaf: true,
                isActive,
                onSelect: () => navigateTo(Object.assign({}, currentContext, { activeTestType: h.test, activeTestId: testId }))
              }));
            });
            if (typeof testMap.create === "function") {
              testContainer.appendChild(createTreeRow({
                icon: "➕",
                title: nav.addLabel || `Add ${testDef.title}`,
                isLeaf: true,
                isAddAction: true,
                onSelect: () => {
                  const newRecord = testMap.create(obj);
                  if (!newRecord) return;
                  const testId = newRecord[testMap.idKey];
                  saveToStorage();
                  navigateTo(Object.assign({}, currentContext, { activeTestType: h.test, activeTestId: testId }));
                }
              }));
            }
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
        <div style="font-weight:800;font-size:1rem;color:var(--accent);">NAVIGATION TREE</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">Active path auto-expanded</div>
      </div>
      <button class="btn-icon" onclick="toggleDrawer(false)" style="font-size:1.1rem;">✕</button>
    </div>
    <div class="tree-search-wrap">
      <input type="text" id="tree-search-input" placeholder="🔍 Quick Filter..." oninput="filterTreeNodes(this.value)">
    </div>
    <div id="tree-root" style="padding: 0.5rem 0.35rem; display: flex; flex-direction: column; gap: 0.2rem;"></div>
    <div style="border-top: 1px solid var(--panel-border); margin-top: 1rem; padding: 0.75rem 0.5rem;">
      <div style="font-size: 0.72rem; color: var(--muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem; padding: 0 0.5rem;">
        ⚙️ Maintenance & Testing
      </div>
      <button class="btn-secondary" style="width: 100%; height: 38px; font-size: 0.8rem; border-color: var(--danger); color: var(--danger);" onclick="resetDatabase()">
        🗑️ Reset Database (Start Fresh)
      </button>
    </div>
  `;
  const root = document.getElementById("tree-root");
  const projectList = appDb[DatabaseMap.rootCollection] || {};
  Object.keys(projectList).forEach(projId => {
    renderRecursiveNode(DatabaseMap.rootEntity, projectList[projId], projId, root);
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
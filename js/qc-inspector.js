// @ts-nocheck
function handleScaleInput(fieldKey, rawValue) {
  const ctx = getActiveContext();
  if (!ctx.record) return;
  const step = findStep(fieldKey);
  const home = getStepHome(step) || ctx.record;
  home[fieldKey] = rawValue === "" ? null : parseFloat(rawValue);
  propagateChange(Nav.activeTestType, ctx, fieldKey);
  updateCalculatedDisplays();
  saveToStorage();
  if (step && step.rerender) renderScreen();
}

function handleDatetimeInput(fieldKey, rawValue) {
  const ctx = getActiveContext();
  const step = findStep(fieldKey);
  if (!ctx.record || !step) return;
  const record = ctx.record;
  if (rawValue) {
    record[fieldKey] = rawValue;
    if (step.autoKey) record[step.autoKey] = false;
  } else if (step.autoValueKey) {
    record[fieldKey] = record[step.autoValueKey];
    if (step.autoKey) record[step.autoKey] = true;
  } else {
    record[fieldKey] = null;
  }
  propagateChange(Nav.activeTestType, ctx, fieldKey);
  saveToStorage();
  renderScreen();
}

function handleChoiceInput(fieldKey, value) {
  const step = findStep(fieldKey);
  if (!step || !SourceResolvers[step.resolver]) return;
  const ctx = getActiveContext();
  SourceResolvers[step.resolver].apply(ctx, value);
  propagateChange(Nav.activeTestType, ctx, fieldKey);
  saveToStorage();
  renderScreen();
}

// Swapping a source/calibration is a Door 1 input: updates link and propagates downstream
function handleSourceSwap(fieldKey, value) {
  const step = findStep(fieldKey);
  if (!step || !step.fetch || !SourceResolvers[step.fetch]) return;
  const ctx = getActiveContext();
  SourceResolvers[step.fetch].apply(ctx, value);
  propagateChange(Nav.activeTestType, ctx, fieldKey);
  updateCalculatedDisplays();
  saveToStorage();
  renderScreen();
}

function updateCalculatedDisplays() {
  const record = getActiveRecord();
  if (!record) return;
  const test = TestDefinitions[Nav.activeTestType];
  const sequence = test ? test.sequence : [];
  document.querySelectorAll("[data-calc]").forEach(el => {
    const fieldKey = el.getAttribute("data-calc");
    const fieldObj = record[fieldKey];
    if (!fieldObj) return;
    const step = sequence.find(item => item.key === fieldKey);
    const decimals = step && step.decimals !== undefined ? step.decimals : 3;
    el.textContent = formatValue(fieldObj, decimals);
    el.style.color = fieldObj.isManual ? "var(--warning)" : "var(--success)";
  });
}


function directInspectorDependencies(step, type = Nav.activeTestType) {
  const dependencies = [];
  const seen = new Map();
  const add = (depType, key, relation) => {
    const id = depType + "." + key;
    if (seen.has(id)) {
      const existing = seen.get(id);
      if (!existing.relations.includes(relation)) existing.relations.push(relation);
      return;
    }
    const dep = { type: depType, key, relations: [relation] };
    seen.set(id, dep);
    dependencies.push(dep);
  };

  // "from" describes formula inputs, or the values used to choose a fetched source.
  (step && step.from || []).forEach(key =>
    add(type, key, step && step.fetch ? "source selection" : "calculation")
  );
  // "reads" identifies values actually read from another test/record.
  readsOf(step).forEach(read => add(read.type, read.key, "source value"));
  return dependencies;
}

function inspectorNodeId(type, key) {
  return type + "." + key;
}

function buildInspectorTrace(type, key) {
  const nodes = new Map();

  function visit(nodeType, nodeKey, route, ancestors) {
    const id = inspectorNodeId(nodeType, nodeKey);
    if (ancestors.has(id)) return null;

    let node = nodes.get(id);
    if (!node) {
      node = { id, type: nodeType, key: nodeKey, route, dependencies: [], depth: 0 };
      nodes.set(id, node);
    }
    if (node.visited) return node;
    node.visited = true;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    directInspectorDependencies(stepOf(nodeType, nodeKey), nodeType).forEach(dep => {
      const edge = { fromType: nodeType, fromKey: nodeKey, toType: dep.type, toKey: dep.key };
      const child = visit(dep.type, dep.key, route.concat(edge), nextAncestors);
      if (child) node.dependencies.push({ ...dep, node: child });
    });
    return node;
  }

  const root = visit(type, key, [], new Set());
  const depthOf = (node, visiting = new Set()) => {
    if (visiting.has(node.id) || !node.dependencies.length) return 0;
    const next = new Set(visiting);
    next.add(node.id);
    node.depth = 1 + Math.max(...node.dependencies.map(dep => depthOf(dep.node, next)));
    return node.depth;
  };
  if (root) depthOf(root);
  return { root, nodes: [...nodes.values()] };
}

function inspectorLabel(type, key) {
  const step = stepOf(type, key);
  const testTitle = TestDefinitions[type] && TestDefinitions[type].title;
  return (step ? step.label : key) +
    (type !== Nav.activeTestType ? " · " + (testTitle || type) : "");
}

function focusInspectorDependency(key) {
  const step = stepOf(Nav.activeTestType, key);
  if (!step) return;

  // The speed sheet exposes a stable row for main steps and prerequisites.
  Nav.mode = "SPEED";
  navigateTo({ mode: "SPEED", stepIndex: 0 });

  const rows = [...document.querySelectorAll("[data-step-row]")]
    .filter(el => el.dataset.stepRow === key);
  const calc = [...document.querySelectorAll("[data-calc]")]
    .find(el => el.getAttribute("data-calc") === key);
  const controlRow = rows.find(el => el.querySelector("input, select, textarea"));
  const calcRow = calc && calc.closest("[data-step-row]");
  const row = calcRow && rows.includes(calcRow) ? calcRow : (controlRow || rows[0]);

  // Open every accordion containing the target before scrolling or focusing it.
  for (let parent = row && row.parentElement; parent; parent = parent.parentElement) {
    if (parent.matches("details")) parent.open = true;
  }
  if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });

  if (step.type === "computed" && calc) {
    const card = calc.closest(".speed-card") || calc.closest(".card");
    if (card) toggleInspector(key, card);
  } else {
    const control = row && row.querySelector("input, select, textarea");
    if (control) control.focus({ preventScroll: true });
  }
}

function navigateInspectorRoute(route, type, key) {
  for (const edge of route) {
    if (edge.fromType === edge.toType) continue;
    const consumerStep = stepOf(Nav.activeTestType, edge.fromKey);
    const resolver = consumerStep && consumerStep.fetch && SourceResolvers[consumerStep.fetch];
    const context = getActiveContext();
    const where = resolver && resolver.locate ? resolver.locate(context) : null;
    if (!where) return;
    goToSource(where, context);
  }
  if (Nav.activeTestType !== type) return;
  focusInspectorDependency(key);
}

function renderInspectorFullTrace(drawer, outputKey, type) {
  const details = document.createElement("details");
  details.className = "inspector-full-trace";
  details.style.cssText = "margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid var(--panel-border);";
  const summary = document.createElement("summary");
  summary.textContent = "Full dependency trace";
  summary.style.cssText = "cursor:pointer;font-weight:700;font-size:0.85rem;";
  details.appendChild(summary);

  const trace = buildInspectorTrace(type, outputKey);
  if (!trace.root || !trace.root.dependencies.length) {
    const empty = document.createElement("div");
    empty.className = "dependency-detail";
    empty.textContent = "No declared dependency chain.";
    details.appendChild(empty);
    drawer.appendChild(details);
    return;
  }

  const body = document.createElement("div");
  body.style.cssText = "margin-top:0.6rem;display:flex;flex-direction:column;gap:0.65rem;";
  trace.nodes.filter(node => node.dependencies.length)
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
    .forEach(node => {
      const group = document.createElement("div");
      group.style.cssText = "padding:0.55rem;border:1px solid var(--panel-border);border-radius:0.45rem;";
      const level = document.createElement("div");
      level.className = "dependency-detail";
      level.style.cssText = "font-size:0.72rem;color:var(--muted);margin-bottom:0.35rem;";
      level.textContent = "Calculation level " + node.depth;
      group.appendChild(level);

      const inputs = document.createElement("div");
      inputs.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:0.3rem;";
      node.dependencies.forEach((dep, index) => {
        if (index) {
          const separator = document.createElement("span");
          separator.textContent = "+";
          separator.style.color = "var(--muted)";
          inputs.appendChild(separator);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-secondary";
        button.style.cssText = "font-size:0.78rem;padding:0.3rem 0.45rem;";
        button.textContent = inspectorLabel(dep.type, dep.key);
        button.title = dep.relations.join("; ");
        button.onclick = () => navigateInspectorRoute(dep.node.route, dep.type, dep.key);
        inputs.appendChild(button);
      });
      group.appendChild(inputs);

      const arrow = document.createElement("div");
      arrow.textContent = "↓";
      arrow.style.cssText = "text-align:center;color:var(--muted);margin:0.15rem 0;";
      group.appendChild(arrow);

      const output = document.createElement("div");
      output.style.cssText = "font-weight:700;font-size:0.82rem;";
      output.textContent = inspectorLabel(node.type, node.key);
      group.appendChild(output);
      body.appendChild(group);
    });

  const final = document.createElement("div");
  final.style.cssText = "font-weight:700;text-align:center;padding:0.45rem;";
  final.textContent = "Inspected value: " + inspectorLabel(type, outputKey);
  body.appendChild(final);
  details.appendChild(body);
  drawer.appendChild(details);
}

function toggleInspector(outputKey, cardEl) {
  const existingDrawer = cardEl.querySelector(".dependency-box");
  if (existingDrawer) {
    existingDrawer.remove();
    return;
  }
  const record = getActiveRecord();
  const fieldObj = record && record[outputKey];
  if (!fieldObj) return;

  const type = Nav.activeTestType;
  const step = stepOf(type, outputKey);
  const isManual = fieldObj.isManual;
  const currentVal = fieldObj.manual !== null ? fieldObj.manual : "";

  const drawer = document.createElement("div");
  drawer.className = "dependency-box";
  drawer.innerHTML =
    '<div class="dependency-title">🔍 Inspect: ' + outputKey + '</div>' +
    '<div class="dependency-detail">Status: <strong>' +
      (isManual ? "🟡 Manual Override Active" : "🟢 Auto Calculated") + '</strong></div>' +
    '<div class="dependency-detail"><strong>Direct dependencies</strong></div>' +
    '<div class="dependency-direct-list"></div>' +
    '<div class="dependency-source"></div>' +
    '<div style="margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid var(--panel-border);">' +
      '<label style="font-size:0.8rem;">Manual Override Value:</label>' +
      '<input type="number" step="any" placeholder="Type override number..." ' +
        'style="height:38px;font-size:0.95rem;margin:0.3rem 0;">' +
      '<button class="btn-action" style="background:' +
        (isManual ? 'var(--warning)' : 'var(--accent)') + ';color:black;">' +
        (isManual ? "Switch Back to Auto Value" : "Turn ON Manual Override") +
      '</button></div>';

  const overrideInput = drawer.querySelector('input[type="number"]');
  overrideInput.value = currentVal;
  overrideInput.onchange = () => setManualOverride(outputKey, overrideInput.value);
  drawer.querySelector(".btn-action").onclick = () => toggleOverrideSwitch(outputKey);

  if (step && step.fetch && SourceResolvers[step.fetch]) {
    const view = SourceResolvers[step.fetch].view(getActiveContext());
    const source = drawer.querySelector(".dependency-source");
    if ((view.options && view.options.length) || (view.lines && view.lines.length)) {
      source.style.cssText = "margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid var(--panel-border);";
      if (view.options && view.options.length) {
        const label = document.createElement("label");
        label.textContent = "🔗 Attached Calibration / Source:";
        label.style.cssText = "font-size:0.8rem;font-weight:700;color:var(--text);";
        source.appendChild(label);
        const select = document.createElement("select");
        select.className = "step-select";
        select.style.marginTop = "0.3rem";
        view.options.forEach(option => {
          const item = document.createElement("option");
          item.value = option.value;
          item.textContent = option.label;
          item.selected = option.selected;
          select.appendChild(item);
        });
        select.onchange = () => handleSourceSwap(outputKey, select.value);
        source.appendChild(select);
      }
      (view.lines || []).forEach(line => {
        const div = document.createElement("div");
        div.className = "src-line" + (line.tone ? " src-" + line.tone : "");
        div.style.fontSize = "0.78rem";
        div.textContent = line.text;
        source.appendChild(div);
      });
    }
  }

  const dependencyList = drawer.querySelector(".dependency-direct-list");
  directInspectorDependencies(step, type).forEach(dep => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary";
    button.style.cssText = "display:block;width:100%;text-align:left;margin-top:0.35rem;";
    button.textContent = inspectorLabel(dep.type, dep.key);
    button.title = dep.relations.join("; ");
    button.onclick = () => navigateInspectorRoute([
      { fromType: type, fromKey: outputKey, toType: dep.type, toKey: dep.key }
    ], dep.type, dep.key);
    dependencyList.appendChild(button);
  });
  if (!dependencyList.children.length) dependencyList.textContent = "No declared dependencies.";

  renderInspectorFullTrace(drawer, outputKey, type);
  cardEl.appendChild(drawer);
}

function setManualOverride(outputKey, rawValue) {
  const record = getActiveRecord();
  const fieldObj = record[outputKey];
  if (!fieldObj) return;
  const typed = rawValue === "" ? null : parseFloat(rawValue);
  fieldObj.manual = (typed === null || isNaN(typed)) ? null : typed;
  fieldObj.isManual = fieldObj.manual !== null;
  propagateChange(Nav.activeTestType, getActiveContext(), outputKey);
  updateCalculatedDisplays();
  saveToStorage();
  renderScreen();
}

function toggleOverrideSwitch(outputKey) {
  const record = getActiveRecord();
  const fieldObj = record[outputKey];
  if (!fieldObj) return;
  if (fieldObj.manual !== null) {
    fieldObj.isManual = !fieldObj.isManual;
  }
  propagateChange(Nav.activeTestType, getActiveContext(), outputKey);
  updateCalculatedDisplays();
  saveToStorage();
  renderScreen();
}
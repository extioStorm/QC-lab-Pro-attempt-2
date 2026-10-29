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


function directInspectorDependencies(step) {
  const dependencies = [];
  const seen = new Set();
  (step && step.from || []).forEach(key => {
    const id = Nav.activeTestType + "." + key;
    if (!seen.has(id)) {
      seen.add(id);
      dependencies.push({ type: Nav.activeTestType, key });
    }
  });
  readsOf(step).forEach(read => {
    const id = read.type + "." + read.key;
    if (!seen.has(id)) {
      seen.add(id);
      dependencies.push({ type: read.type, key: read.key });
    }
  });
  return dependencies;
}

function focusInspectorDependency(key) {
  const step = stepOf(Nav.activeTestType, key);
  if (!step) return;

  const test = TestDefinitions[Nav.activeTestType];
  let stepIndex = 0;
  if (step.home || step.fetch || step.resolver) {
    Nav.mode = "SPEED";
  } else if (Nav.mode === "INTERACTIVE") {
    stepIndex = test.sequence.filter(s => !s.home && !s.fetch && !s.resolver)
      .findIndex(s => s.key === key);
  }
  navigateTo({ mode: Nav.mode, stepIndex: Math.max(0, stepIndex) });

  const row = [...document.querySelectorAll("[data-step-row]")]
    .find(el => el.dataset.stepRow === key);
  const details = row && row.closest("details");
  if (details) details.open = true;
  if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });

  const calc = [...document.querySelectorAll("[data-calc]")]
    .find(el => el.getAttribute("data-calc") === key);
  if (step.type === "computed" && calc) {
    const card = calc.closest(".speed-card") || calc.closest(".card");
    if (card) toggleInspector(key, card);
  } else {
    const control = (row && row.querySelector("input, select, textarea")) ||
      document.querySelector("input, select, textarea");
    if (control) control.focus({ preventScroll: true });
  }
}

function navigateToInspectorDependency(type, key, fromKey) {
  if (type === Nav.activeTestType) {
    focusInspectorDependency(key);
    return;
  }

  const context = getActiveContext();
  const sourceStep = stepOf(Nav.activeTestType, fromKey);
  const resolver = sourceStep && sourceStep.fetch && SourceResolvers[sourceStep.fetch];
  const where = resolver && resolver.locate ? resolver.locate(context) : null;
  if (!where) return;

  goToSource(where, context);
  focusInspectorDependency(key);
}

function toggleInspector(outputKey, cardEl) {
  const existingDrawer = cardEl.querySelector(".dependency-box");
  if (existingDrawer) {
    existingDrawer.remove();
    return;
  }
  const record = getActiveRecord();
  const fieldObj = record[outputKey];
  if (!fieldObj) return;

  const step = findStep(outputKey);
  const isManual = fieldObj.isManual;
  const currentVal = fieldObj.manual !== null ? fieldObj.manual : "";

  const drawer = document.createElement("div");
  drawer.className = "dependency-box";
  
  let sourceHtml = "";
  if (step && step.fetch && SourceResolvers[step.fetch]) {
    const view = SourceResolvers[step.fetch].view(getActiveContext());
    if (view.options && view.options.length) {
      sourceHtml = `
        <div style="margin-top:0.75rem; padding-top:0.6rem; border-top:1px solid var(--panel-border);">
          <label style="font-size:0.8rem; font-weight:700; color:var(--text);">🔗 Attached Calibration / Source:</label>
          <select class="step-select" style="margin-top:0.3rem;" onchange="handleSourceSwap('${outputKey}', this.value)">
            ${view.options.map(o => `<option value="${o.value}" ${o.selected ? "selected" : ""}>${o.label}</option>`).join("")}
          </select>
          ${view.lines.map(l => `<div class="src-line ${l.tone ? "src-" + l.tone : ""}" style="font-size:0.78rem;">${l.text}</div>`).join("")}
        </div>
      `;
    } else if (view.lines && view.lines.length) {
      sourceHtml = `
        <div style="margin-top:0.6rem; font-size:0.8rem;">
          ${view.lines.map(l => `<div class="src-line ${l.tone ? "src-" + l.tone : ""}">${l.text}</div>`).join("")}
        </div>
      `;
    }
  }

  drawer.innerHTML = `
    <div class="dependency-title">🔍 Inspect: ${outputKey}</div>
    <div class="dependency-detail">Status: <strong>${isManual ? "🟡 Manual Override Active" : "🟢 Auto Calculated"}</strong></div>
    <div class="dependency-detail"><strong>Direct dependencies</strong></div>
    <div class="dependency-direct-list"></div>
    ${sourceHtml}
    <div style="margin-top:0.75rem; padding-top:0.6rem; border-top:1px solid var(--panel-border);">
      <label style="font-size:0.8rem;">Manual Override Value:</label>
      <input type="number" step="any" value="${currentVal}"
             placeholder="Type override number..."
             style="height:38px;font-size:0.95rem;margin:0.3rem 0;"
             onchange="setManualOverride('${outputKey}', this.value)">
      <button class="btn-action" style="background:${isManual ? 'var(--warning)' : 'var(--accent)'};color:black;"
              onclick="toggleOverrideSwitch('${outputKey}')">
        ${isManual ? "Switch Back to Auto Value" : "Turn ON Manual Override"}
      </button>
    </div>
  `;

  const dependencyList = drawer.querySelector(".dependency-direct-list");
  directInspectorDependencies(step).forEach(dep => {
    const depStep = stepOf(dep.type, dep.key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary";
    button.style.cssText = "display:block;width:100%;text-align:left;margin-top:0.35rem;";
    button.textContent = (depStep ? depStep.label : dep.key) +
      (dep.type !== Nav.activeTestType ? " · " + ((TestDefinitions[dep.type] || {}).title || dep.type) : "");
    button.onclick = () => navigateToInspectorDependency(dep.type, dep.key, outputKey);
    dependencyList.appendChild(button);
  });
  if (!dependencyList.children.length) {
    dependencyList.textContent = "No declared dependencies.";
  }
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
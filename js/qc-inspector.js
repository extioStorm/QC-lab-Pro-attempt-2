// @ts-nocheck
// The inspector: the drawer that opens on a calculated value to show where it comes from and let the
// person override it. It only draws and reacts. The dependency graph comes from qc-calculations.js
// (directDependencies, buildDependencyTrace, dependencyLabel) and getting around from qc-navigation.js
// (jumpToStep, followDependencyRoute).
// Something the person entered changed `key`: recalculate everything that depends on it and save.
// redraw: rebuild the screen (needed when the change alters what is shown, not just numbers).
// reopen: open the inspector on `key` again after the redraw.
// step: the step that changed, when it is not one of the test on screen (a field of a level's own record).
function commitChange(key, { redraw = true, reopen = false, step } = {}) {
  propagateChange(Nav.activeTestType, getActiveContext(), key, step || stepOf(Nav.activeTestType, key));
  saveToStorage();
  if (!redraw) { updateCalculatedDisplays(); return; }
  renderScreen();
  if (reopen) reopenInspector(key);
}

// A value typed, ticked or picked on a step: a number for "input", true/false for "check", text otherwise. `step` defaults to the step of the test on screen; a level's own field passes its step.
function handleScaleInput(fieldKey, rawValue, step = findStep(fieldKey)) {
  const home = getStepHome(step);
  if (!home) return;
  const type = step ? step.type : "input";
  const text = String(rawValue).trim();
  if (type === "check") home[fieldKey] = Boolean(rawValue);
  else if (text === "") home[fieldKey] = null;
  else home[fieldKey] = type === "input" ? parseFloat(text) : text;
  const test = DatabaseMap.tests[Nav.activeTestType];
  if (test && home === getActiveRecord()) applyAutoFill(Nav.activeTestType, home, getActiveContext()[test.parent], fieldKey);
  commitChange(fieldKey, { redraw: Boolean(step && step.rerender), step });
}

function handleDatetimeInput(fieldKey, rawValue) {
  const record = getActiveRecord();
  const step = findStep(fieldKey);
  if (!record || !step) return;
  const useAuto = !rawValue && step.autoValueKey;
  record[fieldKey] = rawValue || (useAuto ? record[step.autoValueKey] : null);
  if (step.autoKey) record[step.autoKey] = Boolean(useAuto);
  commitChange(fieldKey);
}

// A choice (which Rice test, which calibration...) changed. `stepProp` says which resolver the step uses:
// "resolver" for a choice step, "fetch" for a fetched value whose source is swapped in the inspector.
function applySourceChoice(fieldKey, value, stepProp, reopen) {
  const step = findStep(fieldKey);
  const resolver = step && SourceResolvers[step[stepProp]];
  if (!resolver) return;
  resolver.apply(getActiveContext(), value);
  commitChange(fieldKey, { reopen });
}
function handleChoiceInput(fieldKey, value) { applySourceChoice(fieldKey, value, "resolver", false); }
function handleSourceSwap(fieldKey, value) { applySourceChoice(fieldKey, value, "fetch", true); }

function updateCalculatedDisplays() {
  const record = getActiveRecord();
  if (!record) return;
  document.querySelectorAll("[data-calc]").forEach(el => {
    const fieldKey = el.getAttribute("data-calc");
    const fieldObj = record[fieldKey];
    if (!fieldObj) return;
    const step = findStep(fieldKey);
    el.textContent = formatValue(fieldObj, step && step.decimals !== undefined ? step.decimals : 3);
    el.classList.toggle("is-manual", Boolean(fieldObj.isManual));
  });
}

// Open the inspector on a calculated value that is drawn on screen (a screen redraw closes it).
function reopenInspector(outputKey) {
  const { calc } = findStepElements(outputKey);
  const card = calc && (calc.closest(".speed-card") || calc.closest(".card"));
  if (card) toggleInspector(outputKey, card);
}

// A dependency was tapped: go to where that value lives (it may be in another test) and show it.
function goToDependency(route, type, key) {
  if (!followDependencyRoute(route, type)) {
    alert("There is no saved record to open for this value yet.");
    return;
  }
  const step = findStep(key);
  const found = jumpToStep(key);
  if (found && step && step.type === "computed") reopenInspector(key);
}

// A tappable dependency: shows its name, explains the relation on hover, and goes there when tapped.
function buildDependencyButton(dep, route, className) {
  const button = el("button", className, dependencyLabel(dep.type, dep.key));
  button.type = "button";
  button.title = dep.relations.join("; ");
  button.onclick = () => goToDependency(route, dep.type, dep.key);
  return button;
}

// The whole chain behind a value, one group per calculation: its inputs (tappable) → what they make.
function renderInspectorFullTrace(drawer, outputKey, type) {
  const details = el("details", "inspector-full-trace");
  details.appendChild(el("summary", "", "Full dependency trace"));
  drawer.appendChild(details);

  const trace = buildDependencyTrace(type, outputKey);
  if (!trace.root || !trace.root.dependencies.length) {
    details.appendChild(el("div", "dependency-detail", "No declared dependency chain."));
    return;
  }
  const body = el("div", "trace-body");
  trace.nodes.filter(node => node.dependencies.length)
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
    .forEach(node => {
      const group = el("div", "trace-group");
      group.appendChild(el("div", "trace-level", "Calculation level " + node.depth));
      const inputs = el("div", "trace-inputs");
      node.dependencies.forEach((dep, index) => {
        if (index) inputs.appendChild(el("span", "trace-sep", "+"));
        inputs.appendChild(buildDependencyButton(dep, dep.node.route, "btn-secondary btn-small"));
      });
      group.appendChild(inputs);
      group.appendChild(el("div", "trace-arrow", "↓"));
      group.appendChild(el("div", "trace-output", dependencyLabel(node.type, node.key)));
      body.appendChild(group);
    });
  body.appendChild(el("div", "trace-final", "Inspected value: " + dependencyLabel(type, outputKey)));
  details.appendChild(body);
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

  const drawer = el("div", "dependency-box");
  drawer.appendChild(el("div", "dependency-title", "🔍 Inspect: " + outputKey));
  const status = el("div", "dependency-detail", "Status: ");
  status.appendChild(el("strong", "", isManual ? "🟡 Manual Override Active" : "🟢 Auto Calculated"));
  drawer.appendChild(status);

  drawer.appendChild(el("div", "dependency-detail strong", "Direct dependencies"));
  const dependencyList = el("div", "dependency-direct-list");
  directDependencies(type, outputKey).forEach(dep => {
    const route = [{ fromType: type, fromKey: outputKey, toType: dep.type, toKey: dep.key }];
    dependencyList.appendChild(buildDependencyButton(dep, route, "btn-secondary"));
  });
  if (!dependencyList.children.length) dependencyList.textContent = "No declared dependencies.";
  drawer.appendChild(dependencyList);

  if (step && step.fetch && SourceResolvers[step.fetch]) {
    const source = buildSourceView(SourceResolvers[step.fetch].view(getActiveContext()), value => handleSourceSwap(outputKey, value), "🔗 Source:");
    if (source.children.length) {
      source.classList.add("dependency-section");
      drawer.appendChild(source);
    }
  }

  const override = el("div", "dependency-section");
  override.appendChild(el("label", "", "Manual Override Value:"));
  const overrideInput = el("input", "override-input");
  overrideInput.type = "number";
  overrideInput.step = "any";
  overrideInput.placeholder = "Type override number...";
  overrideInput.value = fieldObj.manual !== null ? fieldObj.manual : "";
  overrideInput.onchange = () => setManualOverride(outputKey, overrideInput.value);
  override.appendChild(overrideInput);
  const toggle = el("button", "btn-primary btn-block" + (isManual ? " is-manual" : ""), isManual ? "Switch Back to Auto Value" : "Turn ON Manual Override");
  toggle.onclick = () => toggleOverrideSwitch(outputKey);
  override.appendChild(toggle);
  drawer.appendChild(override);

  renderInspectorFullTrace(drawer, outputKey, type);
  cardEl.appendChild(drawer);
}

function setManualOverride(outputKey, rawValue) {
  const fieldObj = (getActiveRecord() || {})[outputKey];
  if (!fieldObj) return;
  const typed = parseFloat(rawValue);
  fieldObj.manual = hasNumber(typed) ? typed : null;
  fieldObj.isManual = fieldObj.manual !== null;
  commitChange(outputKey, { reopen: true });
}

function toggleOverrideSwitch(outputKey) {
  const fieldObj = (getActiveRecord() || {})[outputKey];
  if (!fieldObj) return;
  if (fieldObj.manual !== null) fieldObj.isManual = !fieldObj.isManual;
  commitChange(outputKey, { reopen: true });
}

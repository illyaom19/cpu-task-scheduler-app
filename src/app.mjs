import { DEFAULT_SIMULATION_END, createTask, normalizeTaskNames, validateSimulation } from "./model.mjs";
import { PRESETS, SCENARIOS, scenarioTasks, taskFromPreset } from "./presets.mjs";
import { renderInspector, renderTimeline } from "./renderer.mjs";
import { runSimulation } from "./scheduler.mjs";

const state = {
  tasks: scenarioTasks(SCENARIOS[0]),
  simulationEnd: SCENARIOS[0].simulationEnd || DEFAULT_SIMULATION_END,
  result: null,
  selectedTaskId: null,
  selectedInterval: null,
  autoRun: true,
  showTaskLanes: true,
  stale: false,
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindStaticEvents();
  renderPresetButtons();
  renderScenarioButtons();
  rerun();
});

function bindElements() {
  elements.taskList = document.querySelector("#task-list");
  elements.presetList = document.querySelector("#preset-list");
  elements.scenarioList = document.querySelector("#scenario-list");
  elements.simulationEnd = document.querySelector("#simulation-end");
  elements.summary = document.querySelector("#summary");
  elements.errors = document.querySelector("#errors");
  elements.timeline = document.querySelector("#timeline");
  elements.inspector = document.querySelector("#inspector");
  elements.exportBox = document.querySelector("#export-box");
  elements.importBox = document.querySelector("#import-box");
  elements.runState = document.querySelector("#run-state");
  elements.runSimulation = document.querySelector("#run-simulation");
  elements.autoRun = document.querySelector("#auto-run");
  elements.showTaskLanes = document.querySelector("#show-task-lanes");
}

function bindStaticEvents() {
  elements.simulationEnd.addEventListener("input", (event) => {
    state.simulationEnd = Number(event.target.value);
    requestRun();
  });

  elements.runSimulation.addEventListener("click", () => {
    rerun();
  });

  elements.autoRun.addEventListener("change", (event) => {
    state.autoRun = event.target.checked;
    if (state.autoRun || !state.result) {
      rerun();
    } else {
      renderRunState();
    }
  });

  elements.showTaskLanes.addEventListener("change", (event) => {
    state.showTaskLanes = event.target.checked;
    renderTimeline(elements.timeline, state.result, {
      selectedTaskId: state.selectedTaskId,
      showTaskLanes: state.showTaskLanes,
    });
  });

  document.querySelector("#add-task").addEventListener("click", () => {
    state.tasks = normalizeTaskNames([...state.tasks, createTask({ index: state.tasks.length })]);
    requestRun();
  });

  document.querySelector("#clear-tasks").addEventListener("click", () => {
    state.tasks = [];
    requestRun();
  });

  document.querySelector("#export-json").addEventListener("click", () => {
    elements.exportBox.value = JSON.stringify({ simulationEnd: state.simulationEnd, tasks: state.tasks }, null, 2);
  });

  document.querySelector("#import-json").addEventListener("click", () => {
    importScenario();
  });

  elements.timeline.addEventListener("click", (event) => {
    const intervalNode = event.target.closest("[data-interval]");
    if (!intervalNode) {
      return;
    }

    state.selectedInterval = JSON.parse(intervalNode.dataset.interval);
    renderInspector(elements.inspector, state.selectedInterval);
  });
}

function renderPresetButtons() {
  elements.presetList.textContent = "";

  PRESETS.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-button";
    button.textContent = preset.name;
    button.addEventListener("click", () => {
      state.tasks = normalizeTaskNames([...state.tasks, taskFromPreset(preset, state.tasks.length)]);
      requestRun();
    });
    elements.presetList.append(button);
  });
}

function renderScenarioButtons() {
  elements.scenarioList.textContent = "";

  SCENARIOS.forEach((scenario) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scenario-button";
    button.innerHTML = `<strong>${scenario.name}</strong><span>${scenario.description}</span>`;
    button.addEventListener("click", () => {
      state.tasks = scenarioTasks(scenario);
      state.simulationEnd = scenario.simulationEnd;
      state.selectedTaskId = null;
      state.selectedInterval = null;
      requestRun();
    });
    elements.scenarioList.append(button);
  });
}

function renderTasks() {
  elements.taskList.textContent = "";

  if (state.tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No tasks loaded. Add a preset or create a custom task.";
    elements.taskList.append(empty);
    return;
  }

  state.tasks.forEach((task, index) => {
    const row = document.createElement("article");
    row.className = `task-row ${state.selectedTaskId === task.id ? "selected" : ""}`;
    row.innerHTML = `
      <label class="task-enabled">
        <input type="checkbox" data-field="enabled" ${task.enabled ? "checked" : ""}>
        <span></span>
      </label>
      <input class="task-name" data-field="name" value="${escapeHtml(task.name)}" aria-label="Task name">
      <label>
        Phase
        <input type="number" data-field="releaseTime" min="0" step="0.1" value="${task.releaseTime}">
      </label>
      <label class="execution-control">
        Execution
        <div class="dual-range" style="--actual:${toPercent(task.actualExecutionTime)}%; --wcet:${toPercent(task.wcet)}%;">
          <span class="duration-rail"></span>
          <input class="actual-range" type="range" data-field="actualExecutionTime" min="0.1" max="12" step="0.1" value="${task.actualExecutionTime}" aria-label="${escapeHtml(task.name)} actual execution time">
          <input class="wcet-range" type="range" data-field="wcet" min="0.1" max="12" step="0.1" value="${task.wcet}" aria-label="${escapeHtml(task.name)} worst case execution time">
        </div>
        <output><span>Actual ${task.actualExecutionTime}</span><span>WCET ${task.wcet}</span></output>
      </label>
      <label>
        Period
        <input type="number" data-field="period" min="0.1" step="0.1" value="${task.period}">
      </label>
      <label>
        Deadline
        <input type="number" data-field="deadline" min="0.1" step="0.1" value="${task.deadline}">
      </label>
      <label>
        Color
        <input type="color" data-field="color" value="${task.color}">
      </label>
      <div class="row-actions">
        <button type="button" data-action="select">Trace</button>
        <button type="button" data-action="duplicate">Duplicate</button>
        <button type="button" data-action="delete">Delete</button>
      </div>
    `;

    row.addEventListener("input", (event) => updateTaskFromInput(event, index));
    row.addEventListener("click", (event) => handleTaskAction(event, index));
    elements.taskList.append(row);
  });
}

function updateTaskFromInput(event, index) {
  const field = event.target.dataset.field;

  if (!field) {
    return;
  }

  const value = event.target.type === "checkbox"
    ? event.target.checked
    : event.target.type === "number" || event.target.type === "range"
      ? Number(event.target.value)
      : event.target.value;

  const updated = { ...state.tasks[index], [field]: value };

  if (field === "wcet" && updated.actualExecutionTime > updated.wcet) {
    updated.actualExecutionTime = updated.wcet;
  }

  if (field === "actualExecutionTime" && updated.actualExecutionTime > updated.wcet) {
    updated.actualExecutionTime = updated.wcet;
  }

  state.tasks = normalizeTaskNames(state.tasks.map((task, taskIndex) => taskIndex === index ? updated : task));
  requestRun();
}

function handleTaskAction(event, index) {
  const action = event.target.dataset.action;

  if (!action) {
    return;
  }

  if (action === "delete") {
    state.tasks = state.tasks.filter((_, taskIndex) => taskIndex !== index);
  }

  if (action === "duplicate") {
    const duplicate = createTask({
      ...state.tasks[index],
      id: undefined,
      name: `${state.tasks[index].name} Copy`,
      index: state.tasks.length,
    });
    state.tasks = normalizeTaskNames([...state.tasks, duplicate]);
  }

  if (action === "select") {
    state.selectedTaskId = state.selectedTaskId === state.tasks[index].id ? null : state.tasks[index].id;
  }

  requestRun();
}

function rerun() {
  state.stale = false;
  elements.simulationEnd.value = state.simulationEnd;
  elements.autoRun.checked = state.autoRun;
  elements.showTaskLanes.checked = state.showTaskLanes;
  state.result = runSimulation(state.tasks, state.simulationEnd);
  renderTasks();
  renderErrors();
  renderSummary();
  renderTimeline(elements.timeline, state.result, {
    selectedTaskId: state.selectedTaskId,
    showTaskLanes: state.showTaskLanes,
  });
  renderInspector(elements.inspector, state.selectedInterval);
  renderRunState();
}

function requestRun() {
  if (state.autoRun) {
    rerun();
    return;
  }

  state.stale = true;
  renderTasks();
  renderErrors();
  renderRunState();
}

function renderRunState() {
  if (state.stale) {
    elements.runState.textContent = "Inputs changed. Press Run to refresh the trace.";
    elements.runState.classList.add("stale");
    return;
  }

  elements.runState.textContent = state.autoRun
    ? "Auto mode armed. EDF priority, conservative look-ahead reservation, discrete P-states."
    : "Manual mode armed. Press Run after edits to refresh the trace.";
  elements.runState.classList.remove("stale");
}

function renderErrors() {
  elements.errors.textContent = "";

  const validationErrors = validateSimulation(state.tasks, state.simulationEnd);
  if (validationErrors.length === 0) {
    return;
  }

  validationErrors.forEach((error) => {
    const item = document.createElement("li");
    item.textContent = error;
    elements.errors.append(item);
  });
}

function renderSummary() {
  const result = state.result;
  const metrics = result.metrics;

  elements.summary.innerHTML = `
    ${metric("Schedulable", metrics.schedulable ? "YES" : "NO", metrics.schedulable ? "good" : "bad")}
    ${metric("Jobs", `${metrics.completedJobs}/${metrics.totalJobs}`)}
    ${metric("Misses", metrics.totalMisses, metrics.totalMisses === 0 ? "good" : "bad")}
    ${metric("Idle", metrics.idleTime)}
    ${metric("Preemptions", metrics.preemptions)}
    ${metric("Utilization", metrics.utilization)}
    ${metric("Avg P-state", metrics.averageFrequency)}
    ${metric("Deferred", metrics.deferredWork)}
    ${metric("Reclaimed", metrics.reclaimedSlack)}
  `;

  if (result.misses.length > 0) {
    const list = document.createElement("ol");
    list.className = "miss-list";
    result.misses.forEach((miss) => {
      const item = document.createElement("li");
      item.textContent = `${miss.taskName} #${miss.instance} missed at t=${miss.missTime} with ${miss.remainingActual} remaining.`;
      list.append(item);
    });
    elements.summary.append(list);
  }
}

function importScenario() {
  try {
    const payload = JSON.parse(elements.importBox.value);
    const tasks = Array.isArray(payload.tasks) ? payload.tasks.map((task, index) => createTask({ ...task, index })) : [];
    state.tasks = normalizeTaskNames(tasks);
    state.simulationEnd = Number(payload.simulationEnd) || state.simulationEnd;
    state.selectedTaskId = null;
    state.selectedInterval = null;
    requestRun();
  } catch (error) {
    elements.errors.innerHTML = `<li>Import failed: ${escapeHtml(error.message)}</li>`;
  }
}

function metric(label, value, tone = "") {
  return `
    <div class="metric ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function toPercent(value) {
  const min = 0.1;
  const max = 12;
  return Math.max(0, Math.min(100, ((Number(value) - min) / (max - min)) * 100));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

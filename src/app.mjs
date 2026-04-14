import { DEFAULT_SIMULATION_END, createTask, normalizeTaskNames, validateSimulation } from "./model.mjs";
import { PRESETS, SCENARIOS, scenarioTasks } from "./presets.mjs";
import { renderInspector, renderTimeline } from "./renderer.mjs";
import { runSimulation } from "./scheduler.mjs";

const initialTasks = scenarioTasks(SCENARIOS[0]);

const state = {
  tasks: initialTasks,
  simulationEnd: defaultSimulationEnd(),
  result: null,
  selectedTaskId: null,
  selectedInterval: null,
  stale: false,
  expandedTaskIds: new Set(),
  playbackTime: 0,
  playbackRunning: false,
  playbackModeActive: false,
  playbackStartedAt: 0,
  playbackTimeAtStart: 0,
  playbackFrameId: null,
  playbackInterval: null,
  playbackMiss: null,
};

const elements = {};
const EXECUTION_FIELDS = new Set(["actualExecutionTime", "wcet"]);
const PLAYBACK_MS_PER_TIME_UNIT = 450;
const PLAYBACK_EDGE_RATIO = 0.15;
const MISS_INSPECTOR_HOLD = 1.15;

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindStaticEvents();
  renderScenarioButtons();
  rerun();
});

function bindElements() {
  elements.taskList = document.querySelector("#task-list");
  elements.scenarioList = document.querySelector("#scenario-list");
  elements.simulationEnd = document.querySelector("#simulation-end");
  elements.summary = document.querySelector("#summary");
  elements.errors = document.querySelector("#errors");
  elements.timeline = document.querySelector("#timeline");
  elements.inspector = document.querySelector("#inspector");
  elements.exportBox = document.querySelector("#export-box");
  elements.importBox = document.querySelector("#import-box");
  elements.runState = document.querySelector("#run-state");
  elements.playbackToggle = document.querySelector("#playback-toggle");
  elements.playbackReset = document.querySelector("#playback-reset");
  elements.playbackSlider = document.querySelector("#playback-slider");
  elements.playbackReadout = document.querySelector("#playback-readout");
}

function bindStaticEvents() {
  elements.simulationEnd.addEventListener("input", (event) => {
    state.simulationEnd = Number(event.target.value);
    requestRun();
  });

  elements.playbackToggle.addEventListener("click", () => {
    togglePlayback();
  });

  elements.playbackReset.addEventListener("click", () => {
    resetPlayback();
  });

  elements.playbackSlider.addEventListener("input", (event) => {
    seekPlayback(Number(event.target.value));
  });

  document.querySelector("#add-task").addEventListener("click", () => {
    const task = createTask({ index: state.tasks.length });
    state.tasks = normalizeTaskNames([...state.tasks, task]);
    traceTask(task.id);
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
      clearTrace();
      return;
    }

    const interval = JSON.parse(intervalNode.dataset.interval);
    state.selectedInterval = interval;

    if (interval.taskId) {
      traceTask(interval.taskId);
      refreshTraceView();
    } else {
      untraceTask(interval.taskId);
      refreshTraceView();
    }
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
      state.simulationEnd = defaultSimulationEnd();
      state.selectedTaskId = null;
      state.selectedInterval = null;
      state.expandedTaskIds.clear();
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
    const isExpanded = state.expandedTaskIds.has(task.id) || state.selectedTaskId === task.id;
    const row = document.createElement("article");
    row.className = `task-row ${isExpanded ? "expanded" : "collapsed"} ${state.selectedTaskId === task.id ? "selected" : ""}`;
    row.innerHTML = `
      <div class="task-summary" style="--task-color:${task.color};">
        <button class="task-enable-button ${task.enabled ? "enabled" : "disabled"}" type="button" data-action="toggle-enabled" aria-label="${task.enabled ? "Disable" : "Enable"} ${escapeHtml(task.name)}">${task.enabled ? "Disable" : "Enable"}</button>
        ${isExpanded
          ? `<input class="task-name" data-field="name" value="${escapeHtml(task.name)}" aria-label="Task name">`
          : `<span class="task-name-display">${escapeHtml(task.name)}</span>`
        }
        <button class="task-delete-button" type="button" data-action="delete" aria-label="Delete ${escapeHtml(task.name)}">Delete</button>
      </div>
      ${isExpanded ? `
        <div class="task-details">
          <label>
            Use Premade Task
            <select data-field="presetName">
              ${presetOptions(task)}
            </select>
          </label>
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
            <output><span class="actual-value">Actual ${task.actualExecutionTime}</span><span class="wcet-value">WCET ${task.wcet}</span></output>
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
            <button type="button" data-action="duplicate">Duplicate</button>
          </div>
        </div>
      ` : ""}
    `;

    row.addEventListener("input", (event) => {
      if (event.target.tagName === "SELECT") {
        return;
      }

      const field = event.target.dataset.field;
      updateTaskFromInput(event, index, { shouldRun: !EXECUTION_FIELDS.has(field) });
    });
    row.addEventListener("change", (event) => {
      const field = event.target.dataset.field;
      if (EXECUTION_FIELDS.has(field)) {
        updateTaskFromInput(event, index, { shouldRun: true });
      }
      if (field === "presetName") {
        updateTaskFromInput(event, index);
      }
    });
    row.addEventListener("click", (event) => handleTaskAction(event, index));
    elements.taskList.append(row);
  });
}

function updateTaskFromInput(event, index, options = {}) {
  const { shouldRun = true } = options;
  const field = event.target.dataset.field;

  if (!field) {
    return;
  }

  if (field === "presetName") {
    applyTaskPreset(index, event.target.value);
    requestRun();
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

  if (!shouldRun && EXECUTION_FIELDS.has(field)) {
    syncExecutionControl(event.target.closest(".task-row"), state.tasks[index]);
    return;
  }

  requestRun();
}

function presetOptions(task) {
  const selected = task.presetName || "custom";
  const customSelected = selected === "custom" ? " selected" : "";
  const options = [`<option value="custom"${customSelected}>Custom</option>`];

  PRESETS.forEach((preset) => {
    const value = `preset:${preset.name}`;
    const isSelected = selected === value ? " selected" : "";
    options.push(`<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(preset.name)}</option>`);
  });

  return options.join("");
}

function applyTaskPreset(index, value) {
  const current = state.tasks[index];

  if (!current) {
    return;
  }

  if (value === "custom") {
    state.tasks = state.tasks.map((task, taskIndex) => taskIndex === index
      ? { ...task, category: "custom", presetName: "custom" }
      : task);
    return;
  }

  const presetName = String(value).replace(/^preset:/, "");
  const preset = PRESETS.find((item) => item.name === presetName);

  if (!preset) {
    return;
  }

  const updated = {
    ...createTask({
      ...preset,
      id: current.id,
      color: current.color,
      index,
    }),
    presetName: value,
  };

  state.tasks = normalizeTaskNames(state.tasks.map((task, taskIndex) => taskIndex === index ? updated : task));
}

function handleTaskAction(event, index) {
  const actionTarget = event.target.closest("[data-action]");
  const taskId = state.tasks[index]?.id;

  if (event.target.closest("input, textarea, select") && !event.target.dataset.action) {
    return;
  }

  const action = actionTarget?.dataset.action;

  if (!action) {
    if (event.target.closest(".task-details")) {
      return;
    }

    toggleTaskTrace(taskId);
    refreshTraceView();
    return;
  }

  if (action === "delete") {
    untraceTask(taskId);
    state.tasks = state.tasks.filter((_, taskIndex) => taskIndex !== index);
  }

  if (action === "toggle-enabled") {
    state.tasks = state.tasks.map((task, taskIndex) => taskIndex === index ? { ...task, enabled: !task.enabled } : task);
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

  requestRun();
}

function traceTask(taskId) {
  if (!taskId) {
    return;
  }

  state.selectedTaskId = taskId;
  state.expandedTaskIds.clear();
  state.expandedTaskIds.add(taskId);
}

function untraceTask(taskId = state.selectedTaskId) {
  if (taskId) {
    state.expandedTaskIds.delete(taskId);
  } else {
    state.expandedTaskIds.clear();
  }

  if (!taskId || state.selectedTaskId === taskId) {
    state.selectedTaskId = null;
    state.selectedInterval = null;
  }
}

function toggleTaskTrace(taskId) {
  if (!taskId) {
    return;
  }

  if (state.selectedTaskId === taskId && state.expandedTaskIds.has(taskId)) {
    untraceTask(taskId);
    return;
  }

  state.selectedInterval = null;
  traceTask(taskId);
}

function rerun() {
  resetPlaybackForTrace();
  state.stale = false;
  elements.simulationEnd.value = state.simulationEnd;
  state.result = runSimulation(state.tasks, state.simulationEnd);
  renderTasks();
  renderErrors();
  renderSummary();
  renderTimeline(elements.timeline, state.result, timelineOptions());
  renderCurrentInspector();
  renderRunState();
  renderPlaybackControls();
}

function clearTrace() {
  untraceTask();
  refreshTraceView();
}

function refreshTraceView() {
  renderTasks();
  renderTimeline(elements.timeline, state.result, timelineOptions());
  renderCurrentInspector();
}

function requestRun() {
  rerun();
}

function renderRunState() {
  const result = state.result;

  elements.runState.classList.remove("stale", "bad", "good");

  if (!result?.ok) {
    elements.runState.textContent = "Fix task inputs to render a trace.";
    elements.runState.classList.add("bad");
    return;
  }

  if (result.metrics.totalMisses > 0) {
    elements.runState.textContent = `${result.metrics.totalMisses} deadline miss${result.metrics.totalMisses === 1 ? "" : "es"}. Playback marks each miss with WHICH, WHEN, and WHY.`;
    elements.runState.classList.add("bad");
    return;
  }

  elements.runState.textContent = `Schedulable through t=${formatPlaybackTime(result.metrics.simulationEnd)}. EDF picks the earliest deadline; look-ahead protects future WCET.`;
  elements.runState.classList.add("good");
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
      item.innerHTML = `
        <strong>${escapeHtml(miss.taskName)} #${miss.instance}</strong>
        <span>deadline t=${formatPlaybackTime(miss.missTime)}</span>
        <span>${formatPlaybackTime(miss.remainingActual)} actual time remained, so the job could not finish before its deadline.</span>
      `;
      list.append(item);
    });
    elements.summary.append(list);
  }
}

function togglePlayback() {
  if (state.playbackRunning) {
    pausePlayback();
    return;
  }

  startPlayback();
}

function startPlayback() {
  if (state.stale || !state.result) {
    rerun();
  }

  if (!state.result?.ok) {
    return;
  }

  const simulationEnd = state.result.metrics.simulationEnd;
  if (state.playbackTime >= simulationEnd) {
    state.playbackTime = 0;
  }

  state.playbackModeActive = true;
  state.playbackRunning = true;
  state.playbackStartedAt = performance.now();
  state.playbackTimeAtStart = state.playbackTime;
  state.playbackInterval = activeIntervalAt(state.playbackTime);
  state.playbackMiss = activeMissAt(state.playbackTime);
  renderPlaybackFrame({ followPlayhead: true });
  state.playbackFrameId = requestAnimationFrame(tickPlayback);
}

function pausePlayback() {
  cancelPlaybackFrame();
  state.playbackRunning = false;
  renderPlaybackControls();
}

function resetPlayback() {
  cancelPlaybackFrame();
  state.playbackRunning = false;
  state.playbackModeActive = true;
  state.playbackTime = 0;
  state.playbackInterval = activeIntervalAt(state.playbackTime);
  state.playbackMiss = activeMissAt(state.playbackTime);
  renderPlaybackFrame({ followPlayhead: false });
}

function seekPlayback(time) {
  if (!state.result?.ok) {
    return;
  }

  cancelPlaybackFrame();
  state.playbackRunning = false;
  state.playbackModeActive = true;
  state.playbackTime = clamp(time, 0, state.result.metrics.simulationEnd);
  state.playbackInterval = activeIntervalAt(state.playbackTime);
  state.playbackMiss = activeMissAt(state.playbackTime);
  renderPlaybackFrame({ followPlayhead: true });
}

function tickPlayback(timestamp) {
  if (!state.playbackRunning || !state.result?.ok) {
    return;
  }

  const elapsed = (timestamp - state.playbackStartedAt) / PLAYBACK_MS_PER_TIME_UNIT;
  const simulationEnd = state.result.metrics.simulationEnd;
  state.playbackTime = Math.min(simulationEnd, state.playbackTimeAtStart + elapsed);
  state.playbackInterval = activeIntervalAt(state.playbackTime);
  state.playbackMiss = activeMissAt(state.playbackTime);
  renderPlaybackFrame({ followPlayhead: true });

  if (state.playbackTime >= simulationEnd) {
    state.playbackRunning = false;
    state.playbackFrameId = null;
    renderPlaybackControls();
    return;
  }

  state.playbackFrameId = requestAnimationFrame(tickPlayback);
}

function renderPlaybackFrame(options = {}) {
  renderTimeline(elements.timeline, state.result, timelineOptions());
  renderCurrentInspector();
  renderPlaybackControls();

  if (options.followPlayhead && state.playbackRunning) {
    followPlayheadNearEdge();
  }
}

function resetPlaybackForTrace() {
  cancelPlaybackFrame();
  state.playbackTime = 0;
  state.playbackRunning = false;
  state.playbackModeActive = false;
  state.playbackStartedAt = 0;
  state.playbackTimeAtStart = 0;
  state.playbackInterval = null;
  state.playbackMiss = null;
}

function cancelPlaybackFrame() {
  if (state.playbackFrameId != null) {
    cancelAnimationFrame(state.playbackFrameId);
    state.playbackFrameId = null;
  }
}

function renderPlaybackControls() {
  const simulationEnd = state.result?.metrics?.simulationEnd || state.simulationEnd || 0;
  elements.playbackToggle.textContent = state.playbackRunning ? "Pause" : "Play";
  elements.playbackReset.disabled = !state.result?.ok;
  elements.playbackToggle.disabled = !state.result?.ok;
  elements.playbackSlider.disabled = !state.result?.ok;
  elements.playbackSlider.max = String(simulationEnd);
  elements.playbackSlider.value = String(Math.min(state.playbackTime, simulationEnd));
  elements.playbackReadout.textContent = `t=${formatPlaybackTime(state.playbackTime)} / ${formatPlaybackTime(simulationEnd)}`;
}

function renderCurrentInspector() {
  renderInspector(elements.inspector, state.playbackModeActive ? state.playbackMiss || state.playbackInterval : state.selectedInterval);
}

function timelineOptions() {
  return {
    selectedTaskId: state.selectedTaskId,
    showTaskLanes: true,
    playbackTime: state.playbackTime,
    playbackModeActive: state.playbackModeActive,
    playbackRunning: state.playbackRunning,
  };
}

function activeIntervalAt(time) {
  if (!state.result?.ok) {
    return null;
  }

  const simulationEnd = state.result.metrics.simulationEnd;
  const point = Math.max(0, Math.min(time, Math.max(0, simulationEnd - 0.000001)));

  return state.result.trace.find((interval) => (
    interval.end > interval.start
      && interval.start <= point + 0.000001
      && interval.end > point
  )) || null;
}

function activeMissAt(time) {
  if (!state.result?.ok) {
    return null;
  }

  const simulationEnd = state.result.metrics.simulationEnd;
  const point = Math.max(0, Math.min(time, simulationEnd));
  const miss = state.result.misses.find((item) => (
    item.missTime <= point + 0.000001
      && point < Math.min(simulationEnd, item.missTime + MISS_INSPECTOR_HOLD)
  ));

  if (!miss) {
    return null;
  }

  return {
    ...miss,
    event: "miss",
    reason: "Actual execution was still remaining when this job reached its deadline.",
  };
}

function followPlayheadNearEdge() {
  const svg = elements.timeline.querySelector("svg");
  const playheadX = Number(svg?.dataset.playheadX);

  if (!Number.isFinite(playheadX) || elements.timeline.clientWidth <= 0) {
    return;
  }

  const threshold = elements.timeline.clientWidth * PLAYBACK_EDGE_RATIO;
  const visibleLeft = elements.timeline.scrollLeft;
  const visibleRight = visibleLeft + elements.timeline.clientWidth;

  if (playheadX > visibleRight - threshold) {
    elements.timeline.scrollLeft = playheadX - elements.timeline.clientWidth + threshold;
  } else if (playheadX < visibleLeft + threshold) {
    elements.timeline.scrollLeft = Math.max(0, playheadX - threshold);
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

function defaultSimulationEnd(fallback = DEFAULT_SIMULATION_END) {
  return fallback;
}

function formatPlaybackTime(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function toPercent(value) {
  const min = 0.1;
  const max = 12;
  return Math.max(0, Math.min(100, ((Number(value) - min) / (max - min)) * 100));
}

function syncExecutionControl(row, task) {
  if (!row) {
    return;
  }

  row.querySelector(".dual-range")?.style.setProperty("--actual", `${toPercent(task.actualExecutionTime)}%`);
  row.querySelector(".dual-range")?.style.setProperty("--wcet", `${toPercent(task.wcet)}%`);

  const actualInput = row.querySelector('[data-field="actualExecutionTime"]');
  const wcetInput = row.querySelector('[data-field="wcet"]');
  const actualValue = row.querySelector(".actual-value");
  const wcetValue = row.querySelector(".wcet-value");

  if (actualInput) {
    actualInput.value = task.actualExecutionTime;
  }

  if (wcetInput) {
    wcetInput.value = task.wcet;
  }

  if (actualValue) {
    actualValue.textContent = `Actual ${task.actualExecutionTime}`;
  }

  if (wcetValue) {
    wcetValue.textContent = `WCET ${task.wcet}`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

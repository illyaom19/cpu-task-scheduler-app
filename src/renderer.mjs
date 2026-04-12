const SVG_NS = "http://www.w3.org/2000/svg";

export function renderTimeline(target, result, selectedTaskId = null) {
  target.textContent = "";

  if (!result.ok) {
    target.append(emptyState("Fix task inputs to render a schedule."));
    return;
  }

  const width = Math.max(900, result.metrics.simulationEnd * 22);
  const scheduleHeight = 220;
  const frequencyHeight = 120;
  const margin = { left: 54, right: 24, top: 28, bottom: 28 };
  const plotWidth = width - margin.left - margin.right;
  const timeScale = (time) => margin.left + (time / result.metrics.simulationEnd) * plotWidth;
  const svg = createSvg(width, scheduleHeight + frequencyHeight);

  drawAxis(svg, margin, width, scheduleHeight, result.metrics.simulationEnd, timeScale);
  drawSchedule(svg, result, margin, scheduleHeight, timeScale, selectedTaskId);
  drawFrequency(svg, result, margin, scheduleHeight, frequencyHeight, timeScale);

  target.append(svg);
}

export function renderInspector(target, interval) {
  if (!interval) {
    target.innerHTML = "<strong>Inspector</strong><span>Select a schedule interval for details.</span>";
    return;
  }

  target.innerHTML = `
    <strong>${escapeHtml(interval.event.toUpperCase())}</strong>
    <span>${interval.taskName ? escapeHtml(interval.taskName) : "Processor idle"}</span>
    <span>t=${format(interval.start)} to ${format(interval.end)}</span>
    <span>frequency=${format(interval.frequency)}</span>
    <span>${escapeHtml(interval.reason || "No reason recorded.")}</span>
  `;
}

function drawSchedule(svg, result, margin, scheduleHeight, timeScale, selectedTaskId) {
  const y = margin.top + 34;
  const trackHeight = 54;
  const trace = result.trace.filter((interval) => interval.event === "execution" || interval.event === "idle");

  appendText(svg, margin.left, margin.top, "SCHEDULE", "axis-label");
  appendLine(svg, margin.left, y + trackHeight, timeScale(result.metrics.simulationEnd), y + trackHeight, "track-line");

  trace.forEach((interval) => {
    const x = timeScale(interval.start);
    const width = Math.max(2, timeScale(interval.end) - x);
    const rect = el("rect", {
      x,
      y,
      width,
      height: trackHeight,
      rx: 4,
      class: interval.event === "idle" ? "interval idle" : `interval execution ${interval.deferred ? "deferred" : ""}`,
      fill: interval.event === "idle" ? "#1e242b" : interval.taskColor,
      opacity: selectedTaskId && interval.taskId !== selectedTaskId && interval.event !== "idle" ? "0.28" : "1",
      "data-interval": JSON.stringify(interval),
    });

    rect.append(el("title", {}, tooltip(interval)));
    svg.append(rect);

    if (interval.event === "execution" && width > 34) {
      appendText(svg, x + 8, y + 32, interval.taskName || "", "block-label");
    }
  });

  result.jobs.forEach((job) => {
    const releaseX = timeScale(job.releaseTime);
    const deadlineX = timeScale(Math.min(job.absoluteDeadline, result.metrics.simulationEnd));
    appendLine(svg, releaseX, y - 12, releaseX, y + trackHeight + 12, "release-marker");
    appendLine(svg, deadlineX, y - 16, deadlineX, y + trackHeight + 16, job.missed ? "deadline-marker missed" : "deadline-marker");

    if (job.completedAt != null && job.completedAt <= result.metrics.simulationEnd) {
      const completeX = timeScale(job.completedAt);
      appendCircle(svg, completeX, y + trackHeight + 18, 4, "completion-marker");
    }
  });

  result.misses.forEach((miss) => {
    const x = timeScale(Math.min(miss.missTime, result.metrics.simulationEnd));
    appendText(svg, x + 4, y - 18, "MISS", "miss-label");
  });

  appendLegend(svg, margin.left, scheduleHeight - 34);
}

function drawFrequency(svg, result, margin, scheduleHeight, frequencyHeight, timeScale) {
  const top = scheduleHeight + 16;
  const graphHeight = frequencyHeight - 48;
  const bottom = top + graphHeight;
  const xEnd = timeScale(result.metrics.simulationEnd);

  appendText(svg, margin.left, top - 2, "P-STATE FREQUENCY", "axis-label");
  appendLine(svg, margin.left, bottom, xEnd, bottom, "track-line");

  [0, 0.25, 0.5, 0.75, 1].forEach((state) => {
    const y = bottom - state * graphHeight;
    appendLine(svg, margin.left, y, xEnd, y, "frequency-grid");
    appendText(svg, 10, y + 4, `${Math.round(state * 100)}%`, "tick-label");
  });

  result.trace
    .filter((interval) => interval.end > interval.start)
    .forEach((interval) => {
      const x = timeScale(interval.start);
      const width = Math.max(2, timeScale(interval.end) - x);
      const barHeight = interval.frequency * graphHeight;
      svg.append(el("rect", {
        x,
        y: bottom - barHeight,
        width,
        height: Math.max(2, barHeight),
        rx: 2,
        class: interval.frequency === 0 ? "frequency-bar idle-frequency" : "frequency-bar",
      }));
    });
}

function drawAxis(svg, margin, width, scheduleHeight, simulationEnd, timeScale) {
  const y = scheduleHeight - 10;
  const tickCount = Math.min(12, Math.max(4, Math.ceil(simulationEnd / 5)));

  appendLine(svg, margin.left, y, width - margin.right, y, "axis-line");

  for (let index = 0; index <= tickCount; index += 1) {
    const time = (simulationEnd / tickCount) * index;
    const x = timeScale(time);
    appendLine(svg, x, y, x, y + 6, "axis-line");
    appendText(svg, x - 8, y + 22, format(time), "tick-label");
  }
}

function appendLegend(svg, x, y) {
  const items = [
    ["Execution", "#ff8a1f"],
    ["Deferred", "#ff4d2d"],
    ["Idle", "#1e242b"],
    ["Release", "#38bdf8"],
    ["Deadline", "#f43f5e"],
    ["Complete", "#36d399"],
  ];

  items.forEach(([label, color], index) => {
    const offset = index * 116;
    svg.append(el("rect", { x: x + offset, y, width: 12, height: 12, rx: 2, fill: color, class: "legend-chip" }));
    appendText(svg, x + offset + 18, y + 10, label, "legend-label");
  });
}

function createSvg(width, height) {
  return el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": "Scheduling timeline and frequency chart",
  });
}

function emptyState(text) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = text;
  return element;
}

function appendLine(svg, x1, y1, x2, y2, className) {
  svg.append(el("line", { x1, y1, x2, y2, class: className }));
}

function appendCircle(svg, cx, cy, r, className) {
  svg.append(el("circle", { cx, cy, r, class: className }));
}

function appendText(svg, x, y, text, className) {
  const node = el("text", { x, y, class: className });
  node.textContent = text;
  svg.append(node);
}

function el(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);

  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });

  return node;
}

function tooltip(interval) {
  return [
    interval.event.toUpperCase(),
    interval.taskName || "Idle",
    `t=${format(interval.start)}-${format(interval.end)}`,
    `frequency=${format(interval.frequency)}`,
    interval.reason,
  ].filter(Boolean).join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function format(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderTimeline(target, result, options = {}) {
  const { selectedTaskId = null, showTaskLanes = true } = options;
  target.textContent = "";

  if (!result || !result.ok) {
    target.append(emptyState("Fix task inputs to render a schedule."));
    return;
  }

  const enabledTasks = result.tasks.filter((task) => task.enabled);
  const width = Math.max(980, result.metrics.simulationEnd * 26);
  const margin = { left: 116, right: 30, top: 30 };
  const sharedTop = 68;
  const sharedHeight = 54;
  const laneGap = 16;
  const laneHeight = 34;
  const taskLaneCount = showTaskLanes ? enabledTasks.length : 0;
  const laneStart = sharedTop + sharedHeight + 58;
  const taskLaneBlock = taskLaneCount * (laneHeight + laneGap);
  const axisY = laneStart + taskLaneBlock + 18;
  const frequencyTop = axisY + 48;
  const frequencyHeight = 116;
  const height = frequencyTop + frequencyHeight + 26;
  const plotWidth = width - margin.left - margin.right;
  const timeScale = (time) => margin.left + (time / result.metrics.simulationEnd) * plotWidth;
  const svg = createSvg(width, height);

  drawHeader(svg, margin, timeScale, result.metrics.simulationEnd);
  drawCpuLane(svg, result, margin, sharedTop, sharedHeight, timeScale, selectedTaskId);

  if (showTaskLanes) {
    drawTaskLanes(svg, result, enabledTasks, margin, laneStart, laneHeight, laneGap, timeScale, selectedTaskId);
  } else {
    appendText(svg, margin.left, laneStart, "TASK LANES OFF", "axis-label muted-label");
  }

  drawAxis(svg, margin, axisY, width, result.metrics.simulationEnd, timeScale);
  drawFrequency(svg, result, margin, frequencyTop, frequencyHeight, timeScale);
  appendLegend(svg, margin.left, height - 24);

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
    <span>P-state ${format(interval.frequency)}</span>
    <span>${escapeHtml(interval.reason || "No reason recorded.")}</span>
  `;
}

function drawHeader(svg, margin, timeScale, simulationEnd) {
  appendText(svg, margin.left, 28, "CPU EXECUTION BUS", "axis-label hot-label");
  appendLine(svg, margin.left, 42, timeScale(simulationEnd), 42, "glow-line");
}

function drawCpuLane(svg, result, margin, y, laneHeight, timeScale, selectedTaskId) {
  appendText(svg, 20, y + 34, "CPU", "lane-label");
  appendLine(svg, margin.left, y + laneHeight + 8, timeScale(result.metrics.simulationEnd), y + laneHeight + 8, "track-line");

  result.trace
    .filter((interval) => interval.event === "execution" || interval.event === "idle")
    .forEach((interval) => {
      drawInterval(svg, interval, {
        x: timeScale(interval.start),
        y,
        width: Math.max(3, timeScale(interval.end) - timeScale(interval.start)),
        height: laneHeight,
        selectedTaskId,
        label: interval.event === "execution" ? interval.taskName : "IDLE",
      });
    });

  drawJobMarkers(svg, result.jobs, result.misses, y, laneHeight, timeScale, result.metrics.simulationEnd);
}

function drawTaskLanes(svg, result, tasks, margin, startY, laneHeight, laneGap, timeScale, selectedTaskId) {
  appendText(svg, margin.left, startY - 20, "OPTIONAL TASK LANES", "axis-label");

  tasks.forEach((task, index) => {
    const y = startY + index * (laneHeight + laneGap);
    appendText(svg, 20, y + 23, task.name, selectedTaskId === task.id ? "lane-label selected-label" : "lane-label");
    appendLine(svg, margin.left, y + laneHeight + 6, timeScale(result.metrics.simulationEnd), y + laneHeight + 6, "lane-grid");

    result.trace
      .filter((interval) => interval.taskId === task.id && interval.event === "execution")
      .forEach((interval) => {
        drawInterval(svg, interval, {
          x: timeScale(interval.start),
          y,
          width: Math.max(3, timeScale(interval.end) - timeScale(interval.start)),
          height: laneHeight,
          selectedTaskId,
          label: interval.end - interval.start > 1.4 ? `#${jobIndex(interval.jobId)}` : "",
        });
      });

    drawJobMarkers(
      svg,
      result.jobs.filter((job) => job.taskId === task.id),
      result.misses.filter((miss) => miss.taskId === task.id),
      y,
      laneHeight,
      timeScale,
      result.metrics.simulationEnd,
    );
  });
}

function drawInterval(svg, interval, box) {
  const isIdle = interval.event === "idle";
  const isDimmed = box.selectedTaskId && interval.taskId !== box.selectedTaskId && !isIdle;
  const rect = el("rect", {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rx: 4,
    class: isIdle ? "interval idle" : `interval execution ${interval.deferred ? "deferred" : ""}`,
    fill: isIdle ? "#131a20" : interval.taskColor,
    opacity: isDimmed ? "0.22" : "1",
    "data-interval": JSON.stringify(interval),
  });

  rect.append(el("title", {}, tooltip(interval)));
  svg.append(rect);

  if (box.label && box.width > 34) {
    appendText(svg, box.x + 8, box.y + Math.min(31, box.height - 8), box.label, "block-label");
  }
}

function drawJobMarkers(svg, jobs, misses, y, laneHeight, timeScale, simulationEnd) {
  jobs.forEach((job) => {
    const releaseX = timeScale(job.releaseTime);
    const deadlineX = timeScale(Math.min(job.absoluteDeadline, simulationEnd));
    appendLine(svg, releaseX, y - 9, releaseX, y + laneHeight + 9, "release-marker");
    appendLine(svg, deadlineX, y - 12, deadlineX, y + laneHeight + 12, job.missed ? "deadline-marker missed" : "deadline-marker");

    if (job.completedAt != null && job.completedAt <= simulationEnd) {
      appendCircle(svg, timeScale(job.completedAt), y + laneHeight + 15, 3.5, "completion-marker");
    }
  });

  misses.forEach((miss) => {
    const x = timeScale(Math.min(miss.missTime, simulationEnd));
    appendText(svg, x + 5, y - 15, "MISS", "miss-label");
  });
}

function drawFrequency(svg, result, margin, top, height, timeScale) {
  const graphHeight = height - 44;
  const bottom = top + graphHeight;
  const xEnd = timeScale(result.metrics.simulationEnd);

  appendText(svg, margin.left, top - 9, "P-STATE FREQUENCY", "axis-label hot-label");
  appendLine(svg, margin.left, bottom, xEnd, bottom, "track-line");

  [0, 0.25, 0.5, 0.75, 1].forEach((state) => {
    const y = bottom - state * graphHeight;
    appendLine(svg, margin.left, y, xEnd, y, "frequency-grid");
    appendText(svg, 56, y + 4, `${Math.round(state * 100)}%`, "tick-label");
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

function drawAxis(svg, margin, y, width, simulationEnd, timeScale) {
  const tickCount = Math.min(14, Math.max(4, Math.ceil(simulationEnd / 5)));

  appendLine(svg, margin.left, y, width - margin.right, y, "axis-line");

  for (let index = 0; index <= tickCount; index += 1) {
    const time = (simulationEnd / tickCount) * index;
    const x = timeScale(time);
    appendLine(svg, x, y, x, y + 8, "axis-line");
    appendText(svg, x - 8, y + 24, format(time), "tick-label");
  }
}

function appendLegend(svg, x, y) {
  const items = [
    ["Execute", "#ff8a1f"],
    ["Deferred", "#ff4d2d"],
    ["Idle", "#131a20"],
    ["Release", "#38bdf8"],
    ["Deadline", "#f43f5e"],
    ["Complete", "#36d399"],
  ];

  items.forEach(([label, color], index) => {
    const offset = index * 116;
    svg.append(el("rect", { x: x + offset, y: y - 10, width: 12, height: 12, rx: 2, fill: color, class: "legend-chip" }));
    appendText(svg, x + offset + 18, y, label, "legend-label");
  });
}

function createSvg(width, height) {
  return el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": "Scheduling timeline with shared CPU lane, optional task lanes, and frequency chart",
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

function el(name, attributes = {}, text = "") {
  const node = document.createElementNS(SVG_NS, name);

  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });

  if (text) {
    node.textContent = text;
  }

  return node;
}

function tooltip(interval) {
  return [
    interval.event.toUpperCase(),
    interval.taskName || "Idle",
    `t=${format(interval.start)}-${format(interval.end)}`,
    `P-state=${format(interval.frequency)}`,
    interval.reason,
  ].filter(Boolean).join("\n");
}

function jobIndex(jobId) {
  return String(jobId || "").split("-job-")[1] || "";
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

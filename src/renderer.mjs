const SVG_NS = "http://www.w3.org/2000/svg";

export function renderTimeline(target, result, options = {}) {
  const {
    selectedTaskId = null,
    showTaskLanes = false,
    playbackTime = 0,
    playbackModeActive = false,
    playbackRunning = false,
  } = options;
  target.textContent = "";

  if (!result || !result.ok) {
    target.append(emptyState("Fix task inputs to render a schedule."));
    return;
  }

  const enabledTasks = result.tasks.filter((task) => task.enabled);
  const width = Math.max(980, result.metrics.simulationEnd * 12);
  const margin = { left: 88, right: 22, top: 18 };
  const sharedTop = 56;
  const sharedHeight = 48;
  const laneGap = 12;
  const laneHeight = 34;
  const taskLaneCount = showTaskLanes ? enabledTasks.length : 0;
  const laneStart = sharedTop + sharedHeight + 48;
  const taskLaneBlock = taskLaneCount * (laneHeight + laneGap);
  const axisY = laneStart + taskLaneBlock + 18;
  const frequencyTop = axisY + 46;
  const frequencyHeight = 112;
  const height = frequencyTop + frequencyHeight + 24;
  const plotWidth = width - margin.left - margin.right;
  const timeScale = (time) => margin.left + (time / result.metrics.simulationEnd) * plotWidth;
  const svg = createSvg(width, height);
  const playheadTime = clamp(playbackTime, 0, result.metrics.simulationEnd);
  const playheadX = timeScale(playheadTime);
  const revealTime = playbackModeActive ? playheadTime : result.metrics.simulationEnd;
  const activeInterval = playbackModeActive ? intervalAt(result.trace, playheadTime, result.metrics.simulationEnd) : null;
  const contentLayer = el("g", { class: "timeline-content" });
  const playbackCue = {
    interval: activeInterval,
    box: null,
    running: playbackRunning,
    time: playheadTime,
    width,
    height,
  };

  svg.dataset.playheadX = String(playheadX);

  drawHeader(svg, margin, timeScale, result.metrics.simulationEnd);
  drawCpuLane(svg, contentLayer, result, margin, sharedTop, sharedHeight, timeScale, selectedTaskId, activeInterval, revealTime, playbackCue);

  if (showTaskLanes) {
    drawTaskLanes(svg, contentLayer, result, enabledTasks, margin, laneStart, laneHeight, laneGap, timeScale, selectedTaskId, activeInterval, revealTime, playbackCue);
  } else {
    appendText(svg, margin.left, laneStart, "TASK LANES OFF", "axis-label muted-label");
  }

  drawAxis(svg, margin, axisY, width, result.metrics.simulationEnd, timeScale);
  drawFrequency(svg, contentLayer, result, margin, frequencyTop, frequencyHeight, timeScale, revealTime);
  svg.append(contentLayer);

  if (playbackModeActive) {
    drawPlaybackBubble(svg, playbackCue);
    drawPlayhead(svg, playheadX, height, playheadTime);
  }

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
  appendText(svg, margin.left, 24, "CPU EXECUTION BUS", "axis-label hot-label");
  appendLine(svg, margin.left, 38, timeScale(simulationEnd), 38, "glow-line");
}

function drawCpuLane(svg, contentLayer, result, margin, y, laneHeight, timeScale, selectedTaskId, activeInterval, revealTime, playbackCue) {
  appendText(svg, 20, y + 31, "CPU", "lane-label");
  appendLine(svg, margin.left, y + laneHeight + 8, timeScale(result.metrics.simulationEnd), y + laneHeight + 8, "track-line");

  result.trace
    .filter((interval) => interval.event === "execution" || interval.event === "idle")
    .filter((interval) => interval.start < revealTime)
    .forEach((interval) => {
      const end = Math.min(interval.end, revealTime);

      if (end <= interval.start) {
        return;
      }

      drawInterval(svg, interval, {
        parent: contentLayer,
        x: timeScale(interval.start),
        y,
        width: Math.max(3, timeScale(end) - timeScale(interval.start)),
        height: laneHeight,
        selectedTaskId,
        active: interval === activeInterval,
        entering: playbackCue.running && end - interval.start < 0.35,
        label: interval.event === "execution" ? interval.taskName : "IDLE",
      });

      if (interval === activeInterval) {
        playbackCue.box = {
          x: timeScale(interval.start),
          y,
          width: Math.max(3, timeScale(end) - timeScale(interval.start)),
          height: laneHeight,
        };
      }
    });

  drawJobMarkers(contentLayer, result.jobs, result.misses, y, laneHeight, timeScale, result.metrics.simulationEnd, revealTime);
}

function drawTaskLanes(svg, contentLayer, result, tasks, margin, startY, laneHeight, laneGap, timeScale, selectedTaskId, activeInterval, revealTime, playbackCue) {
  appendText(svg, margin.left, startY - 16, "OPTIONAL TASK LANES", "axis-label");

  tasks.forEach((task, index) => {
    const y = startY + index * (laneHeight + laneGap);
    appendText(svg, 20, y + 24, task.name, selectedTaskId === task.id ? "lane-label selected-label" : "lane-label");
    appendLine(svg, margin.left, y + laneHeight + 6, timeScale(result.metrics.simulationEnd), y + laneHeight + 6, "lane-grid");

    result.trace
      .filter((interval) => interval.taskId === task.id && interval.event === "execution")
      .filter((interval) => interval.start < revealTime)
      .forEach((interval) => {
        const end = Math.min(interval.end, revealTime);

        if (end <= interval.start) {
          return;
        }

        drawInterval(svg, interval, {
          parent: contentLayer,
          x: timeScale(interval.start),
          y,
          width: Math.max(3, timeScale(end) - timeScale(interval.start)),
          height: laneHeight,
          selectedTaskId,
          active: interval === activeInterval,
          entering: playbackCue.running && end - interval.start < 0.35,
          label: interval.end - interval.start > 1.4 ? `#${jobIndex(interval.jobId)}` : "",
        });
      });

    drawJobMarkers(
      contentLayer,
      result.jobs.filter((job) => job.taskId === task.id),
      result.misses.filter((miss) => miss.taskId === task.id),
      y,
      laneHeight,
      timeScale,
      result.metrics.simulationEnd,
      revealTime,
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
    class: `${isIdle ? "interval idle" : `interval execution ${interval.deferred ? "deferred" : ""}`} ${box.active ? "playing" : ""} ${box.entering ? "entering" : ""}`,
    fill: isIdle ? "#131a20" : interval.taskColor,
    opacity: isDimmed ? "0.22" : "1",
    "data-interval": JSON.stringify(interval),
  });

  rect.append(el("title", {}, tooltip(interval)));
  (box.parent || svg).append(rect);

  if (box.label && box.width > 34) {
    appendText(box.parent || svg, box.x + 8, box.y + Math.min(31, box.height - 8), box.label, "block-label");
  }
}

function drawJobMarkers(parent, jobs, misses, y, laneHeight, timeScale, simulationEnd, revealTime = simulationEnd) {
  jobs.forEach((job) => {
    const releaseX = timeScale(job.releaseTime);
    const deadlineTime = Math.min(job.absoluteDeadline, simulationEnd);
    const deadlineX = timeScale(deadlineTime);

    if (job.releaseTime <= revealTime) {
      appendLine(parent, releaseX, y - 8, releaseX, y + laneHeight + 8, "release-marker");
    }

    if (deadlineTime <= revealTime) {
      appendLine(parent, deadlineX, y - 10, deadlineX, y + laneHeight + 10, job.missed ? "deadline-marker missed" : "deadline-marker");
    }

    if (job.completedAt != null && job.completedAt <= simulationEnd) {
      if (job.completedAt <= revealTime) {
        appendCircle(parent, timeScale(job.completedAt), y + laneHeight + 14, 3.5, "completion-marker");
      }
    }
  });

  misses.forEach((miss) => {
    if (miss.missTime > revealTime) {
      return;
    }

    const x = timeScale(Math.min(miss.missTime, simulationEnd));
    appendText(parent, x + 5, y - 13, "MISS", "miss-label");
  });
}

function drawFrequency(svg, contentLayer, result, margin, top, height, timeScale, revealTime) {
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
    .filter((interval) => interval.start < revealTime)
    .forEach((interval) => {
      const end = Math.min(interval.end, revealTime);

      if (end <= interval.start) {
        return;
      }

      const x = timeScale(interval.start);
      const width = Math.max(2, timeScale(end) - x);
      const barHeight = interval.frequency * graphHeight;
      contentLayer.append(el("rect", {
        x,
        y: bottom - barHeight,
        width,
        height: Math.max(2, barHeight),
        rx: 2,
        class: interval.frequency === 0 ? "frequency-bar idle-frequency" : "frequency-bar",
      }));
    });
}

function drawPlayhead(svg, x, height, time) {
  appendLine(svg, x, 6, x, height - 30, "playhead-line");
  appendText(svg, x + 6, 18, `t=${format(time)}`, "playhead-label");
}

function drawPlaybackBubble(svg, cue) {
  if (!cue.interval || !cue.box) {
    return;
  }

  const bubbleWidth = 318;
  const bubbleHeight = 76;
  const padding = 10;
  const isIdle = cue.interval.event === "idle";
  const x = clamp(cue.box.x + Math.min(cue.box.width + 10, 56), 8, cue.width - bubbleWidth - 8);
  const preferredY = cue.box.y - bubbleHeight - 10;
  const y = preferredY >= 8 ? preferredY : Math.min(cue.height - bubbleHeight - 8, cue.box.y + cue.box.height + 12);
  const group = el("g", { class: `qte-bubble ${isIdle ? "idle" : ""} ${cue.running ? "active" : ""}` });
  const which = isIdle ? "IDLE" : `${cue.interval.taskName || "Task"} #${jobIndex(cue.interval.jobId)}`;
  const when = `t=${format(cue.interval.start)} -> ${format(cue.interval.end)} (${format(cue.interval.end - cue.interval.start)})`;
  const why = truncate(`P-state ${format(cue.interval.frequency)} | ${cue.interval.reason || "No reason recorded."}`, 58);

  group.append(el("rect", {
    x,
    y,
    width: bubbleWidth,
    height: bubbleHeight,
    rx: 6,
    class: "qte-bubble-frame",
  }));

  appendText(group, x + padding, y + 18, "WHICH", "qte-label");
  appendText(group, x + 70, y + 18, truncate(which, 31), "qte-value");
  appendText(group, x + padding, y + 40, "WHEN", "qte-label");
  appendText(group, x + 70, y + 40, when, "qte-value");
  appendText(group, x + padding, y + 62, "WHY", "qte-label");
  appendText(group, x + 70, y + 62, why, "qte-value");

  svg.append(group);
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

function truncate(value, maxLength) {
  const text = String(value || "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function intervalAt(trace, time, simulationEnd) {
  const point = Math.max(0, Math.min(time, Math.max(0, simulationEnd - 0.000001)));

  return trace.find((interval) => (
    interval.end > interval.start
      && interval.start <= point + 0.000001
      && interval.end > point
  )) || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
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

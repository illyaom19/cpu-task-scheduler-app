export const P_STATES = [0, 0.25, 0.5, 0.75, 1];

export const DEFAULT_SIMULATION_END = 60;

export const TASK_COLORS = [
  "#ff8a1f",
  "#ff4d2d",
  "#f5b941",
  "#36d399",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#c4f000",
];

export function createTask(overrides = {}) {
  const index = Number.isFinite(overrides.index) ? overrides.index : 0;
  const wcet = numberOr(overrides.wcet, 2);

  return {
    id: overrides.id || cryptoSafeId("task"),
    name: overrides.name || `Task ${index + 1}`,
    releaseTime: numberOr(overrides.releaseTime, 0),
    wcet,
    actualExecutionTime: numberOr(overrides.actualExecutionTime, Math.max(0.25, wcet * 0.75)),
    period: numberOr(overrides.period, 10),
    deadline: numberOr(overrides.deadline, numberOr(overrides.period, 10)),
    color: overrides.color || TASK_COLORS[index % TASK_COLORS.length],
    category: overrides.category || "custom",
    enabled: overrides.enabled !== false,
  };
}

export function normalizeTaskNames(tasks) {
  const seen = new Map();

  return tasks.map((task) => {
    const baseName = String(task.name || "Task").trim() || "Task";
    const count = seen.get(baseName) || 0;
    seen.set(baseName, count + 1);

    if (count === 0) {
      return { ...task, name: baseName };
    }

    return { ...task, name: `${baseName} ${count + 1}` };
  });
}

export function validateSimulation(tasks, simulationEnd) {
  const errors = [];
  const end = Number(simulationEnd);

  if (!Number.isFinite(end) || end <= 0) {
    errors.push("Simulation end time must be greater than 0.");
  }

  tasks.forEach((task) => {
    const prefix = task.name || task.id || "Task";
    assertPositive(errors, prefix, "WCET", task.wcet);
    assertPositive(errors, prefix, "actual execution time", task.actualExecutionTime);
    assertPositive(errors, prefix, "period", task.period);
    assertPositive(errors, prefix, "relative deadline", task.deadline);

    if (!Number.isFinite(Number(task.releaseTime)) || Number(task.releaseTime) < 0) {
      errors.push(`${prefix}: release time must be finite and non-negative.`);
    }

    if (Number(task.actualExecutionTime) > Number(task.wcet)) {
      errors.push(`${prefix}: actual execution time cannot exceed WCET.`);
    }
  });

  return errors;
}

export function generateJobs(tasks, simulationEnd) {
  const jobs = [];
  const enabledTasks = tasks.filter((task) => task.enabled);

  enabledTasks.forEach((task) => {
    let releaseTime = Number(task.releaseTime);
    let instance = 0;

    while (releaseTime <= simulationEnd + Number.EPSILON) {
      const wcet = Number(task.wcet);
      const actualExecutionTime = Number(task.actualExecutionTime);

      jobs.push({
        jobId: `${task.id}-job-${instance}`,
        taskId: task.id,
        taskName: task.name,
        taskColor: task.color,
        instance,
        releaseTime: roundTime(releaseTime),
        absoluteDeadline: roundTime(releaseTime + Number(task.deadline)),
        wcet,
        actualExecutionTime,
        remainingReserved: wcet,
        remainingActual: actualExecutionTime,
        completedAt: null,
        missed: false,
        status: "pending",
      });

      instance += 1;
      releaseTime = Number(task.releaseTime) + instance * Number(task.period);
    }
  });

  return jobs.sort((a, b) => a.releaseTime - b.releaseTime || a.absoluteDeadline - b.absoluteDeadline || a.taskName.localeCompare(b.taskName));
}

export function calculateUtilization(tasks) {
  return tasks
    .filter((task) => task.enabled)
    .reduce((total, task) => total + Number(task.wcet) / Number(task.period), 0);
}

export function roundTime(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function assertPositive(errors, prefix, label, value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    errors.push(`${prefix}: ${label} must be greater than 0.`);
  }
}

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cryptoSafeId(prefix) {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

import { P_STATES, calculateUtilization, generateJobs, roundTime, validateSimulation } from "./model.mjs";

const EPSILON = 0.000001;

export function runSimulation(tasks, simulationEnd, options = {}) {
  const horizon = Number(simulationEnd);
  const pStates = options.pStates || P_STATES;
  const validationErrors = validateSimulation(tasks, horizon);

  if (validationErrors.length > 0) {
    return {
      ok: false,
      errors: validationErrors,
      tasks,
      jobs: [],
      trace: [],
      misses: [],
      metrics: emptyMetrics(tasks),
      pStates,
    };
  }

  const jobs = generateJobs(tasks, horizon);
  const trace = [];
  const misses = [];
  let time = 0;
  let preemptions = 0;
  let reclaimedSlack = 0;
  let deferredWork = 0;
  let lastRunningJobId = null;

  while (time < horizon - EPSILON) {
    markReleased(jobs, time);

    for (const miss of detectMisses(jobs, time)) {
      misses.push(miss);
    }

    const readyJobs = readyAt(jobs, time);

    if (readyJobs.length === 0) {
      const nextRelease = nextReleaseAfter(jobs, time);
      const end = Math.min(horizon, nextRelease ?? horizon);
      pushInterval(trace, {
        start: time,
        end,
        event: "idle",
        frequency: 0,
        deferred: false,
        reason: nextRelease == null ? "No remaining releases before horizon." : "Waiting for next task release.",
      });
      time = end;
      lastRunningJobId = null;
      continue;
    }

    const job = readyJobs[0];
    const frequency = selectPState(jobs, time, pStates);
    const activeFrequency = Math.max(frequency, pStates.find((state) => state > 0) || 1);
    const nextRelease = nextReleaseAfter(jobs, time);
    const completionTime = time + job.remainingActual / activeFrequency;
    const deadlineTime = job.absoluteDeadline;
    const end = Math.min(horizon, nextRelease ?? horizon, completionTime, deadlineTime);
    const duration = Math.max(0, end - time);
    const executed = duration * activeFrequency;

    if (lastRunningJobId && lastRunningJobId !== job.jobId && job.remainingActual > EPSILON) {
      preemptions += 1;
    }

    pushInterval(trace, {
      start: time,
      end,
      event: "execution",
      jobId: job.jobId,
      taskId: job.taskId,
      taskName: job.taskName,
      taskColor: job.taskColor,
      frequency: activeFrequency,
      deferred: activeFrequency < 1,
      reason: activeFrequency < 1
        ? "Reserved future capacity allows this job to run below full speed."
        : "Feasibility requires full-speed execution.",
    });

    if (activeFrequency < 1) {
      deferredWork += duration * (1 - activeFrequency);
    }

    job.remainingActual = Math.max(0, job.remainingActual - executed);
    job.remainingReserved = Math.max(0, job.remainingReserved - executed);
    time = roundTime(end);
    lastRunningJobId = job.jobId;

    if (job.remainingActual <= EPSILON) {
      job.completedAt = time;
      job.status = "complete";
      reclaimedSlack += Math.max(0, job.remainingReserved);
      job.remainingReserved = 0;
      lastRunningJobId = null;
      pushInstant(trace, {
        time,
        event: "completion",
        jobId: job.jobId,
        taskId: job.taskId,
        taskName: job.taskName,
        taskColor: job.taskColor,
        frequency: activeFrequency,
        reason: "Actual execution completed; unused WCET reservation was reclaimed.",
      });
    } else if (time >= deadlineTime - EPSILON) {
      for (const miss of detectMisses(jobs, time)) {
        misses.push(miss);
      }
    }
  }

  for (const miss of detectMisses(jobs, horizon)) {
    misses.push(miss);
  }

  const uniqueMisses = uniqueBy(misses, (miss) => miss.jobId);
  const metrics = buildMetrics(tasks, jobs, trace, uniqueMisses, {
    preemptions,
    reclaimedSlack,
    deferredWork,
    simulationEnd: horizon,
  });

  return {
    ok: true,
    errors: [],
    tasks,
    jobs,
    trace,
    misses: uniqueMisses,
    metrics,
    pStates,
  };
}

export function selectPState(jobs, time, pStates = P_STATES) {
  const required = requiredDensity(jobs, time);
  const selected = pStates.find((state) => state >= required - EPSILON);
  return selected ?? pStates[pStates.length - 1];
}

export function requiredDensity(jobs, time) {
  const incompleteJobs = jobs.filter((job) => job.remainingReserved > EPSILON && job.absoluteDeadline > time + EPSILON);
  const deadlines = [...new Set(incompleteJobs.map((job) => job.absoluteDeadline))].sort((a, b) => a - b);
  let density = 0;

  deadlines.forEach((deadline) => {
    const demand = incompleteJobs
      .filter((job) => job.absoluteDeadline <= deadline + EPSILON && job.releaseTime <= deadline + EPSILON)
      .reduce((sum, job) => sum + job.remainingReserved, 0);
    const window = Math.max(EPSILON, deadline - time);
    density = Math.max(density, demand / window);
  });

  return Math.max(0, density);
}

function buildMetrics(tasks, jobs, trace, misses, extras) {
  const executionIntervals = trace.filter((interval) => interval.event === "execution" && interval.end > interval.start);
  const idleTime = trace
    .filter((interval) => interval.event === "idle")
    .reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const weightedFrequency = executionIntervals.reduce((sum, interval) => sum + interval.frequency * (interval.end - interval.start), 0);
  const executionTime = executionIntervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);

  return {
    schedulable: misses.length === 0,
    totalJobs: jobs.length,
    completedJobs: jobs.filter((job) => job.completedAt != null).length,
    totalMisses: misses.length,
    idleTime: roundTime(idleTime),
    preemptions: extras.preemptions,
    utilization: roundTime(calculateUtilization(tasks)),
    averageFrequency: executionTime > EPSILON ? roundTime(weightedFrequency / executionTime) : 0,
    deferredWork: roundTime(extras.deferredWork),
    reclaimedSlack: roundTime(extras.reclaimedSlack),
    simulationEnd: extras.simulationEnd,
  };
}

function emptyMetrics(tasks) {
  return {
    schedulable: false,
    totalJobs: 0,
    completedJobs: 0,
    totalMisses: 0,
    idleTime: 0,
    preemptions: 0,
    utilization: roundTime(calculateUtilization(tasks)),
    averageFrequency: 0,
    deferredWork: 0,
    reclaimedSlack: 0,
    simulationEnd: 0,
  };
}

function markReleased(jobs, time) {
  jobs.forEach((job) => {
    if (job.status === "pending" && job.releaseTime <= time + EPSILON) {
      job.status = "ready";
    }
  });
}

function readyAt(jobs, time) {
  return jobs
    .filter((job) => job.releaseTime <= time + EPSILON && job.remainingActual > EPSILON && !job.missed)
    .sort((a, b) => a.absoluteDeadline - b.absoluteDeadline || a.releaseTime - b.releaseTime || a.taskName.localeCompare(b.taskName));
}

function nextReleaseAfter(jobs, time) {
  const next = jobs
    .filter((job) => job.releaseTime > time + EPSILON)
    .map((job) => job.releaseTime)
    .sort((a, b) => a - b)[0];

  return Number.isFinite(next) ? next : null;
}

function detectMisses(jobs, time) {
  const misses = [];

  jobs.forEach((job) => {
    if (!job.missed && job.remainingActual > EPSILON && job.absoluteDeadline <= time + EPSILON) {
      job.missed = true;
      job.status = "missed";
      misses.push({
        jobId: job.jobId,
        taskId: job.taskId,
        taskName: job.taskName,
        instance: job.instance,
        missTime: job.absoluteDeadline,
        remainingActual: roundTime(job.remainingActual),
      });
    }
  });

  return misses;
}

function pushInterval(trace, interval) {
  const start = roundTime(interval.start);
  const end = roundTime(interval.end);

  if (end < start + EPSILON) {
    return;
  }

  trace.push({
    start,
    end,
    event: interval.event,
    jobId: interval.jobId || null,
    taskId: interval.taskId || null,
    taskName: interval.taskName || null,
    taskColor: interval.taskColor || null,
    frequency: interval.frequency,
    deferred: Boolean(interval.deferred),
    reason: interval.reason || "",
    deadlineMiss: null,
  });
}

function pushInstant(trace, event) {
  trace.push({
    start: roundTime(event.time),
    end: roundTime(event.time),
    event: event.event,
    jobId: event.jobId || null,
    taskId: event.taskId || null,
    taskName: event.taskName || null,
    taskColor: event.taskColor || null,
    frequency: event.frequency || 0,
    deferred: false,
    reason: event.reason || "",
    deadlineMiss: null,
  });
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const unique = [];

  items.forEach((item) => {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  });

  return unique;
}

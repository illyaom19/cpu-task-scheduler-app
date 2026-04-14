import assert from "node:assert/strict";
import { calculateHyperperiod, createTask, generateJobs, normalizeTaskNames, validateSimulation } from "../src/model.mjs";
import { SCENARIOS, scenarioTasks } from "../src/presets.mjs";
import { requiredDensity, runSimulation, selectPState } from "../src/scheduler.mjs";

const tests = [];

test("generates periodic jobs through the simulation horizon", () => {
  const task = createTask({ id: "sensor", name: "Sensor", releaseTime: 1, wcet: 1, actualExecutionTime: 1, period: 5, deadline: 4 });
  const jobs = generateJobs([task], 13);

  assert.deepEqual(jobs.map((job) => job.releaseTime), [1, 6, 11]);
  assert.deepEqual(jobs.map((job) => job.absoluteDeadline), [5, 10, 15]);
});

test("uses per-instance actual execution times when provided", () => {
  const task = createTask({
    id: "lecture-t1",
    name: "T1",
    releaseTime: 0,
    wcet: 3,
    actualExecutionTime: 2,
    actualExecutionTimes: [2, 1],
    period: 8,
    deadline: 8,
  });
  const jobs = generateJobs([task], 16);

  assert.deepEqual(jobs.map((job) => job.actualExecutionTime), [2, 1, 2]);
});

test("limits generated jobs when max instances is provided", () => {
  const task = createTask({
    id: "lecture-t2",
    name: "T2",
    releaseTime: 0,
    wcet: 3,
    actualExecutionTime: 1,
    actualExecutionTimes: [1, 1],
    maxInstances: 2,
    period: 10,
    deadline: 10,
  });
  const jobs = generateJobs([task], 30);

  assert.deepEqual(jobs.map((job) => job.releaseTime), [0, 10]);
});

test("includes the lecture EDF example from the PDF", () => {
  const scenario = SCENARIOS.find((item) => item.id === "lecture-edf-example");
  const jobs = generateJobs(scenarioTasks(scenario), scenario.simulationEnd);

  assert.equal(scenario.name, "Lecture EDF Example");
  assert.deepEqual(jobs.map((job) => `${job.taskName}:${job.instance}:${job.actualExecutionTime}`), [
    "T1:0:2",
    "T2:0:1",
    "T3:0:1",
    "T1:1:1",
    "T2:1:1",
    "T3:1:1",
  ]);
});

test("normalizes duplicate task names", () => {
  const tasks = normalizeTaskNames([
    createTask({ name: "Motor" }),
    createTask({ name: "Motor" }),
    createTask({ name: "Motor" }),
  ]);

  assert.deepEqual(tasks.map((task) => task.name), ["Motor", "Motor 2", "Motor 3"]);
});

test("calculates a hyperperiod from enabled task periods", () => {
  const tasks = [
    createTask({ period: 5 }),
    createTask({ period: 8 }),
    createTask({ period: 16 }),
    createTask({ period: 15 }),
  ];

  assert.equal(calculateHyperperiod(tasks), 240);
});

test("calculates decimal hyperperiods using scheduler time precision", () => {
  const tasks = [
    createTask({ period: 2.5 }),
    createTask({ period: 7.5 }),
  ];

  assert.equal(calculateHyperperiod(tasks), 7.5);
});

test("ignores disabled tasks when calculating hyperperiod", () => {
  const tasks = [
    createTask({ period: 4 }),
    createTask({ period: 99, enabled: false }),
  ];

  assert.equal(calculateHyperperiod(tasks), 4);
});

test("validates impossible task timing", () => {
  const errors = validateSimulation([
    createTask({ name: "Bad", releaseTime: -1, wcet: 1, actualExecutionTime: 2, period: 0, deadline: 0 }),
  ], 0);

  assert.ok(errors.length >= 4);
});

test("runs a schedulable workload without misses", () => {
  const tasks = [
    createTask({ id: "a", name: "A", releaseTime: 0, wcet: 1, actualExecutionTime: 0.5, period: 5, deadline: 5 }),
    createTask({ id: "b", name: "B", releaseTime: 0, wcet: 1, actualExecutionTime: 0.75, period: 8, deadline: 8 }),
  ];
  const result = runSimulation(tasks, 24);

  assert.equal(result.ok, true);
  assert.equal(result.metrics.schedulable, true);
  assert.equal(result.misses.length, 0);
  assert.ok(result.trace.some((interval) => interval.event === "execution"));
});

test("reports deadline misses for overloaded workloads", () => {
  const tasks = [
    createTask({ id: "heavy-a", name: "Heavy A", releaseTime: 0, wcet: 4, actualExecutionTime: 4, period: 5, deadline: 4 }),
    createTask({ id: "heavy-b", name: "Heavy B", releaseTime: 0, wcet: 4, actualExecutionTime: 4, period: 5, deadline: 5 }),
  ];
  const result = runSimulation(tasks, 12);

  assert.equal(result.metrics.schedulable, false);
  assert.ok(result.misses.length > 0);
});

test("reclaims slack when actual execution is less than WCET", () => {
  const tasks = [
    createTask({ id: "slack", name: "Slack", releaseTime: 0, wcet: 4, actualExecutionTime: 1, period: 12, deadline: 12 }),
  ];
  const result = runSimulation(tasks, 12);

  assert.equal(result.metrics.schedulable, true);
  assert.ok(result.metrics.reclaimedSlack > 0);
});

test("selects the lowest feasible discrete P-state", () => {
  const jobs = generateJobs([
    createTask({ id: "p", name: "P", releaseTime: 0, wcet: 2, actualExecutionTime: 2, period: 10, deadline: 8 }),
  ], 8);

  assert.equal(requiredDensity(jobs, 0), 0.25);
  assert.equal(selectPState(jobs, 0, [0, 0.25, 0.5, 0.75, 1]), 0.25);
});

test("keeps non-instant trace intervals non-negative", () => {
  const result = runSimulation([
    createTask({ id: "trace", name: "Trace", releaseTime: 0, wcet: 2, actualExecutionTime: 1.5, period: 6, deadline: 6 }),
  ], 18);

  result.trace
    .filter((interval) => interval.end !== interval.start)
    .forEach((interval) => assert.ok(interval.end > interval.start, JSON.stringify(interval)));
});

test("records EDF decision metadata for ready jobs", () => {
  const result = runSimulation([
    createTask({ id: "early", name: "Early", releaseTime: 0, wcet: 1, actualExecutionTime: 1, period: 10, deadline: 4 }),
    createTask({ id: "late", name: "Late", releaseTime: 0, wcet: 1, actualExecutionTime: 1, period: 10, deadline: 8 }),
  ], 10);
  const firstExecution = result.trace.find((interval) => interval.event === "execution");

  assert.equal(firstExecution.decision.selectedTaskId, "early");
  assert.deepEqual(firstExecution.decision.availableJobs.map((job) => job.taskName), ["Early", "Late"]);
  assert.match(firstExecution.decision.why, /earliest absolute deadline/i);
});

test("records idle decision metadata when no jobs are ready", () => {
  const result = runSimulation([
    createTask({ id: "future", name: "Future", releaseTime: 3, wcet: 1, actualExecutionTime: 1, period: 10, deadline: 4 }),
  ], 5);
  const idle = result.trace.find((interval) => interval.event === "idle");

  assert.deepEqual(idle.decision.availableJobs, []);
  assert.match(idle.decision.why, /next release at t=3/i);
});

test("excludes disabled tasks", () => {
  const result = runSimulation([
    createTask({ id: "off", name: "Off", enabled: false, releaseTime: 0, wcet: 10, actualExecutionTime: 10, period: 10, deadline: 10 }),
  ], 20);

  assert.equal(result.jobs.length, 0);
  assert.equal(result.metrics.totalJobs, 0);
});

for (const item of tests) {
  item.run();
  console.log(`ok - ${item.name}`);
}

function test(name, run) {
  tests.push({ name, run });
}

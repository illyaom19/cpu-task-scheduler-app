import { TASK_COLORS, createTask } from "./model.mjs";

export const PRESETS = [
  { name: "Sensor Read", category: "sensor", releaseTime: 0, wcet: 1, actualExecutionTime: 0.6, period: 5, deadline: 5 },
  { name: "Motor Control", category: "control", releaseTime: 0, wcet: 2, actualExecutionTime: 1.4, period: 8, deadline: 8 },
  { name: "BLE Update", category: "radio", releaseTime: 1, wcet: 1.5, actualExecutionTime: 1, period: 12, deadline: 10 },
  { name: "WiFi Update", category: "radio", releaseTime: 2, wcet: 3, actualExecutionTime: 2.2, period: 20, deadline: 18 },
  { name: "Display Refresh", category: "display", releaseTime: 0, wcet: 1, actualExecutionTime: 0.8, period: 16, deadline: 16 },
  { name: "Logging", category: "storage", releaseTime: 4, wcet: 2.5, actualExecutionTime: 1.2, period: 25, deadline: 20 },
  { name: "Health Check", category: "diagnostic", releaseTime: 3, wcet: 1.2, actualExecutionTime: 0.7, period: 15, deadline: 15 },
  { name: "Peripheral Comms", category: "io", releaseTime: 2, wcet: 1.8, actualExecutionTime: 1.3, period: 10, deadline: 9 },
  { name: "Custom Task", category: "custom", releaseTime: 0, wcet: 2, actualExecutionTime: 1.5, period: 10, deadline: 10 },
];

export const SCENARIOS = [
  {
    id: "balanced-ecu",
    name: "Balanced ECU",
    simulationEnd: 60,
    description: "Schedulable control workload with slack reclaimed from early completions.",
    tasks: [
      { name: "Sensor Read", category: "sensor", releaseTime: 0, wcet: 1, actualExecutionTime: 0.55, period: 5, deadline: 5 },
      { name: "Motor Control", category: "control", releaseTime: 0, wcet: 2, actualExecutionTime: 1.4, period: 8, deadline: 8 },
      { name: "Display Refresh", category: "display", releaseTime: 1, wcet: 1, actualExecutionTime: 0.8, period: 16, deadline: 16 },
      { name: "Health Check", category: "diagnostic", releaseTime: 3, wcet: 1.2, actualExecutionTime: 0.7, period: 15, deadline: 15 },
    ],
  },
  {
    id: "overloaded-bus",
    name: "Overloaded Bus",
    simulationEnd: 40,
    description: "Dense radio and control load that forces visible deadline misses.",
    tasks: [
      { name: "Motor Control", category: "control", releaseTime: 0, wcet: 3, actualExecutionTime: 2.8, period: 6, deadline: 5 },
      { name: "WiFi Update", category: "radio", releaseTime: 1, wcet: 4, actualExecutionTime: 3.5, period: 9, deadline: 8 },
      { name: "Peripheral Comms", category: "io", releaseTime: 1, wcet: 2.5, actualExecutionTime: 2.3, period: 7, deadline: 7 },
    ],
  },
  {
    id: "slack-reclaim",
    name: "Slack Reclaim",
    simulationEnd: 70,
    description: "Large WCET reservations with shorter actual execution times.",
    tasks: [
      { name: "Sensor Read", category: "sensor", releaseTime: 0, wcet: 2, actualExecutionTime: 0.7, period: 8, deadline: 8 },
      { name: "Logging", category: "storage", releaseTime: 4, wcet: 5, actualExecutionTime: 1.5, period: 24, deadline: 20 },
      { name: "BLE Update", category: "radio", releaseTime: 2, wcet: 2, actualExecutionTime: 0.8, period: 12, deadline: 10 },
    ],
  },
];

export function taskFromPreset(preset, index = 0) {
  return createTask({
    ...preset,
    index,
    color: TASK_COLORS[index % TASK_COLORS.length],
  });
}

export function scenarioTasks(scenario) {
  return scenario.tasks.map((task, index) => taskFromPreset(task, index));
}

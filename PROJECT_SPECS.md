# Interactive Look-Ahead Conserving EDF Scheduling Simulator
## Technical Functional Specification

**Project:** ENGR 467 Option 3  
**Author:** Illya Omelyanchuk  
**Document Type:** Technical functionality specification  
**Format:** Markdown

---

## 1. Purpose

This project shall provide a **web-based interactive simulator** for **Look-Ahead Conserving EDF scheduling**. The system must allow a user to define real-time tasks, run a scheduling simulation over a finite timeline, and visualize:

- task releases
- execution intervals
- preemptions
- deferred execution
- actual completion times
- deadline misses
- operating frequency scaling over time

The application must prioritize:

- correctness of scheduling behavior
- ease of use
- fast iteration on task sets
- clear visualization of timing and energy-aware behavior

---

## 2. Project Goal

The simulator is intended to demonstrate how **Look-Ahead Conserving EDF** behaves relative to conventional EDF-style execution in a real-time embedded context.

The system shall support the educational exploration of:

- schedulability
- deadline behavior
- deferred work
- reserved future execution
- scaled CPU frequency / P-state behavior
- energy-aware scheduling tradeoffs

---

## 3. Scope

### 3.1 In Scope
The application shall include:

- interactive task definition
- simulation over a user-defined timeline
- EDF-based priority selection
- Look-Ahead Conserving EDF logic
- timeline rendering
- frequency visualization
- schedulability feedback
- deadline miss reporting
- support for preset RTOS-style task templates
- support for custom tasks

### 3.2 Out of Scope
The first release does **not** require:

- authentication
- database-backed persistence
- multi-user collaboration
- cloud computation
- hardware deployment
- full mobile-first design
- support for all RTOS algorithms beyond the selected scope
- production-grade power models beyond the chosen scheduler abstraction

---

## 4. Users

The primary user is expected to be:

- a student learning RTOS scheduling
- an instructor reviewing scheduler behavior
- a developer demonstrating timing interactions in embedded systems

The interface must therefore be technically accurate while still being easy to operate without reading lengthy instructions.

---

## 5. Functional Requirements

## 5.1 Task Definition

The system shall allow the user to define one or more real-time tasks.

Each task shall support the following inputs:

- **Task name**
- **Release time / phase**
- **Worst-case execution time**
- **Actual execution time** (optional, if modeling early completion)
- **Period**
- **Relative deadline**
- **Task color or visual label**
- **Task category / preset type**
- **Enabled / disabled state**

### 5.1.1 Minimum Required Inputs
At minimum, the simulator must support:

- release time
- execution time
- period
- deadline
- simulation end time

### 5.1.2 Validation Rules
The system shall validate that:

- execution time is greater than 0
- period is greater than 0
- deadline is greater than 0
- simulation end time is greater than 0
- release time is non-negative
- deadline is not nonsensical relative to task instance generation
- numeric inputs are valid and finite
- duplicate task names are either disallowed or automatically renamed

### 5.1.3 Task Presets
The simulator should include drag-and-drop or one-click presets representing RTOS-like workloads, such as:

- Sensor Reads
- Motor Controls
- BLE Updates
- WiFi Updates
- Display Refresh
- Logging
- Health Checks
- Peripheral Communications
- Custom Task

Each preset shall prefill reasonable default timing values, which the user may edit.

---

## 5.2 Simulation Control

The simulator shall provide controls to:

- run the simulation
- pause an animated playback (if implemented)
- reset the current simulation
- clear all tasks
- load an example scenario
- edit an existing task and rerun
- delete a task
- duplicate a task

The simulator should support:

- automatic recomputation when task data changes
- manual recomputation via a dedicated button

---

## 5.3 Task Instance Generation

The system shall expand each periodic task into task instances over the simulation horizon.

For each task instance, the simulator shall compute:

- instance release time
- absolute deadline
- remaining execution time
- completion status
- miss status

The generator must stop creating instances once their release time exceeds the simulation end time.

---

## 5.4 Scheduling Engine

The scheduling engine is the core functional requirement.

The application shall implement:

- earliest-deadline-first selection logic
- look-ahead conserving behavior
- work deferral when safe
- reservation of future processor capacity
- support for actual execution differing from worst-case execution
- recalculation of frequency requirements over time

### 5.4.1 Base Scheduling Behavior
At each scheduling decision point, the engine shall evaluate:

- available released jobs
- each job's absolute deadline
- each job's remaining execution time
- deferred jobs
- reserved future work
- current operating frequency / P-state

### 5.4.2 Required Scheduling Events
The scheduling engine must respond to:

- task release
- task completion
- preemption
- deadline miss
- idle intervals
- actual execution ending earlier than worst case
- frequency changes

### 5.4.3 Scheduler Outputs
The engine shall produce a machine-readable simulation trace including:

- time interval start
- time interval end
- running job
- task/job identifier
- selected frequency
- whether the interval is deferred or immediate
- reason for scheduling choice
- whether a deadline miss occurred

---

## 5.5 Look-Ahead Conserving EDF Logic

The project must specifically support **Look-Ahead Conserving EDF**, not only plain EDF.

The engine shall therefore support:

- future reservation of execution demand
- deferral of jobs when enough future capacity exists
- conservative allocation to guarantee deadlines remain feasible
- reclaiming slack when actual execution finishes early
- scheduling deferred work when processor time becomes available
- representation of scaled operating frequency over time

### 5.5.1 Feasibility Awareness
The scheduler shall indicate whether:

- the task set appears schedulable under the modeled algorithm
- a specific job missed its deadline
- a miss occurs at a specific time
- deferral could not be safely maintained

### 5.5.2 Frequency Handling
The system must support one of the following models:

1. **Continuous scaled frequency**, or
2. **Discrete P-states**

At minimum, one must be implemented cleanly and consistently.

If discrete P-states are used, the system shall:

- define available P-states
- choose the next valid state satisfying the required execution reservation
- record the selected state in the trace

---

## 5.6 Visualization

The simulator shall render a visual timeline of scheduling behavior.

### 5.6.1 Required Timeline Content
The timeline must display:

- time axis
- task execution blocks
- release markers
- completion markers
- deadline markers
- missed deadline markers
- preemption boundaries
- deferred execution segments
- idle intervals
- operating frequency over time

### 5.6.2 Required Visual Distinctions
The system shall visually distinguish:

- different tasks
- active execution vs deferred execution
- normal completion vs deadline miss
- idle time vs scheduled time
- frequency changes
- release events vs deadline events

### 5.6.3 Recommended Visualization Layout
A preferred layout is:

- **main schedule track** for execution blocks
- **frequency track** below the schedule
- **summary panel** beside or above the chart

### 5.6.4 Interaction on Visualization
The timeline should support:

- hover tooltips
- click-to-inspect job details
- zooming for long simulations
- panning for dense schedules
- highlighting all instances of a selected task

---

## 5.7 Results and Feedback

The application shall provide a summary view after simulation.

The summary panel must include:

- whether the task set was schedulable in the simulation
- which task instances missed deadlines
- the exact miss times
- total number of misses
- total idle time
- total number of preemptions
- overall utilization based on provided inputs

The panel should also include:

- average or representative operating frequency
- amount of deferred work used
- amount of reclaimed slack
- comparison against baseline EDF, if implemented

---

## 5.8 Comparison Mode (Recommended)

The application should support a side-by-side or toggle comparison between:

- conventional EDF
- Look-Ahead Conserving EDF

This mode should allow the user to compare:

- schedule shape
- missed deadlines
- frequency scaling
- idle time
- deferred work
- energy-oriented behavior

This is not strictly required for a minimum viable version, but it would strongly improve the educational value of the project.

---

## 5.9 Scenario Management

The system should support:

- loading preset example scenarios
- exporting the current task set as JSON
- importing a task set from JSON
- restoring default scenarios

This feature is valuable for demonstrations and testing.

---

## 6. Non-Functional Requirements

## 6.1 Accuracy
The simulator must prioritize correctness over visual polish. Scheduling logic must be internally consistent and reproducible.

## 6.2 Usability
A new user should be able to:

- add tasks
- run a simulation
- understand the result

with minimal explanation.

## 6.3 Responsiveness
Typical task sets should rerun quickly enough to feel interactive.

## 6.4 Maintainability
The application should be modular, with the following logic separated:

- input model
- scheduler engine
- simulation trace generation
- rendering layer
- summary/statistics layer

## 6.5 Extensibility
The codebase should make it possible to later add:

- RM
- FCFS
- RR
- Cycle Conserving EDF
- different energy models
- animation playback

---

## 7. Suggested System Modules

## 7.1 Task Editor Module
Responsible for:

- creating tasks
- editing tasks
- validation
- presets
- task list display

## 7.2 Instance Generator Module
Responsible for:

- expanding periodic task instances
- computing releases and deadlines
- limiting generation by simulation horizon

## 7.3 Scheduler Engine Module
Responsible for:

- EDF decisions
- look-ahead reservation logic
- deferral logic
- frequency assignment
- preemption/completion handling
- deadline miss detection

## 7.4 Trace Builder Module
Responsible for:

- storing simulation intervals
- labeling intervals
- generating renderable schedule data

## 7.5 Visualization Module
Responsible for:

- drawing the schedule timeline
- drawing the frequency timeline
- hover/click interactions
- zoom/pan behavior

## 7.6 Results Module
Responsible for:

- schedulability summary
- miss reports
- utilization summary
- preemption counts
- derived metrics

## 7.7 Scenario Storage Module
Responsible for:

- example scenarios
- import/export
- serialization format

---

## 8. Minimum Viable Product (MVP)

The MVP shall include:

- manual task entry
- simulation end time input
- task instance generation
- Look-Ahead Conserving EDF scheduler logic
- schedule timeline
- frequency timeline
- deadline miss detection
- summary panel
- one or more preset example scenarios

If time is limited, this is the correct minimum scope.

---

## 9. Strong Version 2 Features

After MVP completion, the next best additions are:

- drag-and-drop RTOS task cards
- import/export JSON
- comparison mode with plain EDF
- playback animation
- discrete P-state selection
- advanced tooltips and task filtering
- saved example libraries

---

## 10. Recommended Data Model

A task object should contain fields similar to:

```json
{
  "id": "task-1",
  "name": "Sensor Read",
  "releaseTime": 0,
  "wcet": 2,
  "actualExecutionTime": 1.5,
  "period": 10,
  "deadline": 10,
  "color": "#...",
  "category": "sensor",
  "enabled": true
}
```

A generated job instance should contain fields similar to:

```json
{
  "jobId": "task-1-job-0",
  "taskId": "task-1",
  "releaseTime": 0,
  "absoluteDeadline": 10,
  "remainingExecution": 2,
  "actualExecutionTime": 1.5,
  "status": "ready"
}
```

A schedule trace interval should contain fields similar to:

```json
{
  "start": 4.0,
  "end": 6.0,
  "jobId": "task-1-job-0",
  "taskId": "task-1",
  "frequency": 0.5,
  "deferred": false,
  "event": "execution"
}
```

---

## 11. Recommended Technical Stack

A modern web stack is recommended.

### Front End
- React or similar component-based framework
- TypeScript preferred
- charting or SVG-based custom timeline rendering

### Rendering
- SVG, Canvas, or a charting library capable of precise interval rendering

### Hosting
- GitHub Pages is sufficient for a static deployment

### Storage
- Local state first
- optional browser local storage later

---

## 12. Risks and Implementation Challenges

Key challenges include:

- correctly modeling Look-Ahead Conserving EDF
- keeping the frequency scaling logic understandable
- preventing the UI from becoming cluttered
- making the simulation trace accurate enough for edge cases
- balancing educational clarity with algorithmic complexity

The project should avoid overbuilding the front end before the scheduler core is proven correct.

---

## 13. Build Priority

Recommended implementation order:

1. task data model
2. task entry UI
3. task instance generation
4. scheduler core
5. machine-readable trace output
6. schedule timeline
7. frequency timeline
8. result summary
9. presets/examples
10. advanced interactions

---

## 14. Acceptance Criteria

The project can be considered functionally complete when a user can:

1. create a set of real-time tasks
2. set a simulation end time
3. run the Look-Ahead Conserving EDF simulation
4. see releases, execution, and deadlines on a timeline
5. see deferred work represented visually
6. see operating frequency changes over time
7. determine whether any deadline was missed
8. identify exactly when a miss occurred
9. quickly edit tasks and rerun the simulation
10. use at least one example scenario without manual setup

---

## 15. Summary

This project needs to function as an **interactive educational scheduler simulator** with a real scheduling engine behind it, not merely a static visualizer.

The true must-haves are:

- correct task modeling
- correct Look-Ahead Conserving EDF behavior
- clear timeline rendering
- frequency visualization
- deadline miss reporting
- fast and intuitive interaction

Everything else should support those five pillars.

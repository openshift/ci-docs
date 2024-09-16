---
title: "Dynamic Scheduling of Prowjobs"
description: How Prowjob scheduler and Prowjob dispatcher work together to provide dynamic scheduling of prowjobs
---

Dynamic scheduling was introduced in response to frequent cluster failures observed with a growing cluster fleet. The goal is to enable the rescheduling of jobs by taking into account Prometheus data (job volumes over the last two weeks) and available clusters. Dynamic scheduling consists of two components:

- A reworked Prowjob dispatcher, running as a daemon
- An external plugin to the scheduler (upstream component)

## Prowjob Dispatcher

The dispatcher uses two files:

1. [**Dispatcher Configuration File**](https://github.com/openshift/release/blob/master/core-services/sanitize-prow-jobs/_config.yaml), the old dispatcher config file, is editable by the dispatcher during rescheduling events. This configuration file has been long used and contains job-to-cluster assignments and scheduling mechanisms (such as manual job assignments and colocation).

2. [**Cluster Configuration File**](https://github.com/openshift/release/blob/master/core-services/sanitize-prow-jobs/_clusters.yaml), the second config file, which is more critical for scheduling, contains information about the clusters enabled in the system.

The dispatcher reacts to changes in the cluster configuration, loads the first configuration, and performs the scheduling work. It retains its old behavior of rescheduling jobs based on recent Prometheus input every Sunday.

The dispatcher maintains its own copy of the job-to-cluster assignments. After successful scheduling, it opens a PR (pull request) against `openshift/release`, which should be merged by the **triage role** as soon as possible. The PR retains file-based scheduling as a backup for dynamic scheduling and also updates the necessary config changes [here](https://github.com/openshift/release/blob/master/core-services/sanitize-prow-jobs/_config.yaml).

The dispatcher functions as a REST server that responds to requests containing job names. If a matching job is found in the database, the dispatcher returns the cluster assignment. The job-to-cluster assignment data is also stored in a Persistent Volume Claim (PVC) to prevent data loss in case of pod failures.

## External Plugin for the Scheduler

The [external plugin](https://github.com/kubernetes-sigs/prow/blob/main/pkg/scheduler/strategy/external.go), queries a specified URL (in the case of the Test Platform deployment, it's the dispatcher) to determine the cluster assignment for a given job name. The plugin includes a configurable cache to avoid querying the same data multiple times in a short period.


## Troubleshooting

### I am triage, I want to merge a PR created by the dispatcher, but tests are failing. What should I do?
If the failing tests are related to cluster incompatibility, it might be that the sanitizer is out of sync with the dispatcher. Since the PR is more important, tests should be overridden, and the issue should be reported in Jira.

### I want to force the dispatcher to schedule a job on a specific cluster. I submitted a PR with the change, and it was merged, but the dispatcher is not respecting it. How can I achieve that?
At this time, it's not possible without using hacks. The dispatcher's database takes priority over assignments in config files, which are considered a backup. To reschedule jobs, a PR changing the cluster configuration should be submitted. If the cluster is a special cluster (e.g., `app.ci`), the dispatcher will respect that. If the cluster is manually assigned, the dispatcher may respect it, provided the cluster is not blocked.

### I want to merge a PR created by the dispatcher, but merging is blocked due to a conflict in `openshift/release`. What should I do?
Restart the dispatcher pod. This will trigger the dispatcher to update the PR on the latest `openshift/release` main branch.

### What does the `blocked` category mean in the cluster config?
`blocked` means that the cluster is entirely inaccessible, and the dispatcher will not honor manual assignments to that cluster. Sanitizer presubmit checks may fail in some edge cases due to this (this is only an assumption, as existing issues have been addressed).

### How can I re-trigger a dispatching event without causing an outage?
Simply edit the configuration. You can hack it by adding a non-existent `dummy` cluster (or remove one) in the `blocked` category.

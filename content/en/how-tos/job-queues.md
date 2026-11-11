---
title: "Limit Concurrent Jobs with a Prow Job Queue"
linkTitle: "Job Queues"
description: How to cap how many related CI jobs run at the same time by assigning them to a shared Prow job queue.
---

A Prow job queue is a named concurrency limit enforced by [Plank](https://docs.prow.k8s.io/docs/components/core/plank/), the component that turns a ProwJob into a pod. The queue is a map entry under `plank.job_queue_capacities`. Each test that should share the limit sets `job_queue_name` to that queue's name. Plank starts a waiting job when the number of jobs already occupying the queue is below the capacity.

Every job that sets the same `job_queue_name` shares that capacity: different tests, different branches, and different repositories. Use a queue when those jobs compete for one scarce resource, such as a cloud account, a [boskos](/architecture/quota-and-leases/) lease pool, a license server, or a lab.

## What you gain

Plank applies the limit before it creates a pod. A job that is waiting for a slot stays in the `triggered` state and holds no build-farm pod, no `ci-operator` namespace, and no boskos lease.

That matters for jobs that take a lease after the pod exists. `ci-operator` requests the lease once the test is already running, so extra copies sit on the build farm until a lease is free. A queue sized to that lease pool keeps the extra copies in Prow. When the jobs in the queue are the ones taking those leases, the pod and the lease request start together.

A queue also gives the group one shared control:

* Changing `job_queue_capacities` changes every job assigned to that queue.
* A capacity of `0` admits no job. Assigned jobs remain `triggered` until the capacity is raised or the jobs are aborted. Use this to pause a class of jobs.
* A negative capacity, such as `-1`, disables the queue limit.
* Plank starts the oldest waiting job first. A burst of new pull requests waits behind jobs that are already in the queue.

The count is global for the Prow instance. It includes jobs headed for any build cluster.

## Define the capacity

Add the queue to the supplemental Prow config owned by the team that owns the resource:

`core-services/prow/02_config/<org>/<repo>/_prowconfig.yaml`

An org-wide queue can live in `core-services/prow/02_config/<org>/_prowconfig.yaml`.

{{< highlight yaml >}}
plank:
  job_queue_capacities:
    my-queue: 2
{{< / highlight >}}

The key is the queue name. The value is how many jobs in that queue may run at the same time.

Queue names are global. Prow merges every supplemental file with the main config, and each name may be defined once. A second definition fails with `job queue <name> passed more than once`. Name the queue after the shared resource or the team, and keep the name stable.

`determinize-prow-config` leaves `job_queue_capacities` in the supplemental file that already declares them. The entries stay out of `core-services/prow/02_config/_config.yaml`.

Any repository's tests can reference the name. Define the capacity in one supplemental file, then point every participating test at that same name.

## Assign tests

Set `job_queue_name` on each test in the `ci-operator` config under `ci-operator/config/<org>/<repo>/`. The field is valid on presubmits, postsubmits (`postsubmit: true`), and periodics (`cron`, `interval`, or `minimum_interval`).

{{< highlight yaml >}}
tests:
- as: e2e
  commands: make e2e
  container:
    from: src
  job_queue_name: my-queue
- as: publish
  commands: make publish
  container:
    from: src
  job_queue_name: my-queue
  postsubmit: true
- as: nightly
  commands: make nightly
  container:
    from: src
  cron: '@daily'
  job_queue_name: my-queue
{{< / highlight >}}

`prowgen` copies the name onto the generated Prow job.

Regenerate jobs and refresh Prow config before opening the pull request:

{{< highlight bash >}}
make update
{{< / highlight >}}

The generated job includes the field:

{{< highlight yaml >}}
- agent: kubernetes
  always_run: true
  decorate: true
  job_queue_name: my-queue
  name: pull-ci-example-repo-main-e2e
{{< / highlight >}}

The next `make jobs` run rewrites generated job YAML from the `ci-operator` config, so keep the setting on the test. A handcrafted job can set `job_queue_name` on the job itself. That name has to exist in `job_queue_capacities`.

Omit `job_queue_name` to leave a test out of every queue.

`ci/prow/config` loads the merged Prow config and the generated jobs. It fails the pull request when a job names a queue that is not defined (`invalid job queue name <name>`).

## How a waiting job behaves

Plank evaluates the queue when a ProwJob is `triggered` and has no pod yet. It counts:

* jobs in the queue that are running (Prow state `pending`)
* jobs in the queue that are still `triggered` and were created earlier than the job being considered

When that count is below the capacity, Plank creates the pod and moves the job to `pending`. Otherwise the job stays `triggered`, and Plank checks again about every 10 seconds. On Deck, `triggered` for the whole wait means the job is waiting for a slot.

Finished jobs (`success`, `failure`, `error`, `aborted`) release the slot.

A rehearsal runs the generated job, so it carries the same `job_queue_name` and takes a slot in the live queue. Adding tests to a queue that is already deployed can delay other jobs in that queue for the length of the rehearsal.

A rehearsal of a queue that is introduced in the same pull request uses the Prow config already deployed on the cluster. Plank logs `failed to match queue name '<name>' with Plank configuration` and leaves the rehearsal `triggered` until that capacity is deployed. The ProwJob itself stays `triggered` with no pod. Land the capacity in an earlier change when the rehearsal needs to run.

## Capacity values

| Value | Effect |
| --- | --- |
| Positive integer, for example `2` | At most that many jobs from the queue run at once. |
| `0` | The queue admits nothing. Assigned jobs stay `triggered`. |
| Negative, for example `-1` | The queue limit is disabled. |

Match the capacity to the real pool. Two boskos leases for an account call for a capacity of `2`: two jobs run, and the rest wait in Prow until one finishes. A larger capacity starts pods that then wait inside the test for a lease. A smaller capacity leaves leases idle.

## Example

A supplemental config that defines a queue of one:

{{< highlight yaml >}}
plank:
  job_queue_capacities:
    my-queue: 1
{{< / highlight >}}

A test that sets `job_queue_name: my-queue` is generated with that field. While one job assigned to `my-queue` is running, further jobs assigned to `my-queue` stay `triggered` until it finishes.

---
title: "Cloud Quota Handling and Leases"
description: An overview of cloud compute quotas and aggregate concurrency limits for CI jobs.
---

# How are Cloud Quota and Aggregate Concurrency Limits Handled?

A centralized locking system is provided to jobs in order to limit concurrent usage of shared resources like third-party
cloud APIs.

Jobs that interact with an Infrastructure-as-a-Service (IaaS) cloud provider use credentials shared across the broader
CI platform. Therefore, all jobs interacting with a specific IaaS will use API quota for these cloud providers from a
shared pool. In order to ensure that our job throughput for a provider remains within the aggregate limit imposed by
shared quota, jobs acquire leases for slices of the quota before they run and only relinquish them once all actions are
completed. This document describes the mechanism used to provide leases of quota slices to jobs, how jobs determine
which quota to ask for, how available leases can be configured and how current usage can be monitored.

# Introducing the `boskos` Leasing Server

`boskos` (βοσκός), translating as "shepherd" from Greek, is a resource management server that apportions leases of
resources to clients and manages the lifecycle of the resources. When considering the actions of this server, two terms
should be defined:

|Term|	Definition|
|:---|:---|
|resource|An item which may be leased to clients. Resources represent slices of the larger cloud quota.|
|lease|A binding between a resource and a client. When a lease is active, the underlying resource is not available for other clients.|

The process for granting a lease on a resource follows this workflow:

* a client (lessee) requests a lease on an available resource
* the server (lessor) grants the lease, if possible, or places the client in a FIFO queue to wait for the next available resource
* the client emits a heartbeat while the lease is under active use
* the client relinquishes the lease once it is no longer in use
* the server places the resource back into the available pool for future clients to request

If a client fails to emit a heartbeat for long enough while the client holds a lease, the server will forcibly
relinquish the lease and return the resource to the available pool for other clients. This mechanism ensures that
clients which crash or otherwise fail to remain responsive cannot exhaust resources by holding a lease indefinitely.

# Directions for Cloud Administrators

An administrator of a cloud platform will interact with the leasing server in order to configure the aggregate limit on
jobs for the platform or inspect the current settings and usage. Care must be taken when configuring the leasing server
in order to ensure that jobs are well-behaved against the cloud provider APIs.

## Adding a New Type Of Resource

In order to add a new type of cloud quota to the system, changes to the `boskos` leasing server configuration are
required. The configuration is checked into source control:

* [generator](https://github.com/openshift/release/blob/master/core-services/prow/02_config/generate-boskos.py)
* [generated configuration](https://github.com/openshift/release/blob/master/core-services/prow/02_config/_boskos.yaml)

After altering the generator, run `make boskos-config` to regenerate the configuration.

When adding a new type of quota, a new entry to the `CONFIG` dict is required, for example:

{{< highlight python >}}
CONFIG = {
    'my-new-quota-slice': {
        'default': 10, # how many concurrent jobs can run against the cloud
    },
    # other entries
}
{{< / highlight >}}

The `default` key is a special identifier for declaring dynamic resources; use different identifiers to declare
[static resources](#configuration-for-heterogeneous-resources).

If it is not clear exactly how many concurrent jobs can share the cloud provider at once, the convention is to set the
`default` count to `1000`, to effectively leave jobs unlimited and allow for investigation.

## Configuration for Heterogeneous Resources

The example configuration above will create dynamic resources and is most appropriate for operating against large cloud
APIs where clients act identically regardless of which slice of the quota they have leased. If the cloud provider that
is being configured has a static pool of resources and jobs are expected to act differently based on the specific lease
that they acquire, it is necessary to create a static list of resources for `boskos`:

{{< highlight python >}}
CONFIG = {
    'some-static-quota-slice': {
        'server01.prod.service.com': 1, # these names should be semantically meaningful to a client
        'server02.prod.service.com': 1, # set the count larger than one if multiple jobs can share this resource
        'server03.prod.service.com': 1,
    },
    # other entries
}
{{< / highlight >}}

A test may access the name of the resource that was acquired using the `${LEASED_RESOURCE}` environment variable.


## Viewing Lease Activity Over Time

In order to view the number of concurrent jobs executing against any specific cloud, or to view the states of resources
in the lease system, a [dashboard](https://ci-route-ci-grafana.apps.ci.l2s4.p1.openshiftapps.com/dashboards) exists.

# Directions for Job Authors

Job authors should generally not be concerned with the process of acquiring a lease or the mechanisms behind it.
However, a quick overview of the process is given here to explain what is happening behind the scenes. Whenever
`ci-operator` runs a test target that has a `cluster_profile` set, a lease will be acquired before the test steps are
executed. `ci-operator` will acquire the lease, present the name of the leased resource to the job in the
`${LEASED_RESOURCE}` environment variable, send heartbeats as necessary and relinquish the lease when it is no longer
needed. In order for a `cluster_profile` to be supported, the cloud administrator will need to have set up the quota slice
resources, so by the time a job author uses a `cluster_profile`, all the infrastructure should be in place.

For more complex lease configuration, see the multi-stage test
[section](/docs/architecture/step-registry/#leases).

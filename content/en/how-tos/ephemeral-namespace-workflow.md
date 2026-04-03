---
title: "Using the Ephemeral Namespace Workflow"
description: How to reserve an ephemeral namespace in an OpenShift CI job using the ephemeral-namespace workflow.
---

Ephemeral namespaces are short-lived, isolated OpenShift namespaces managed by
the [Ephemeral Namespace Operator](https://github.com/RedHatInsights/ephemeral-namespace-operator)
on the ephemeral cluster. Engineering teams use them to deploy and test
applications in a clean, disposable environment without interfering with shared
staging or production namespaces.

The `ephemeral-namespace` workflow automates the full lifecycle of an ephemeral
namespace inside an OpenShift CI (Prow) job: it reserves a namespace before your
tests run and releases it afterward, regardless of whether the tests pass or
fail.

{{< alert title="Note" color="info" >}}
This page documents ephemeral **namespaces** on the ephemeral cluster,
not ephemeral **clusters** (full OpenShift installations). For
ephemeral clusters, see [Ephemeral Clusters in Konflux CI](/architecture/ephemeral-cluster-konflux/).
{{< /alert >}}

## Background and Key Concepts

Before using the workflow, it helps to understand the tools and services
involved.

### Bonfire

[Bonfire](https://github.com/RedHatInsights/bonfire) (`crc-bonfire`) is the CLI
tool that powers ephemeral namespace operations. It manages
`NamespaceReservation` custom resources on the ephemeral cluster. The workflow
uses bonfire's `namespace reserve` and `namespace release` commands under the
hood.

### Ephemeral Namespace Operator

The [Ephemeral Namespace Operator](https://github.com/RedHatInsights/ephemeral-namespace-operator)
runs on the ephemeral cluster. It watches `NamespaceReservation` CRs, provisions
namespaces with pre-configured resources, and
automatically cleans up expired reservations. Namespaces are organized into
**pools** (e.g. `default`, `minimal`) that provide different environment
configurations.

### Firelink and InScope

You can also manage ephemeral namespaces through web interfaces:

- **[Firelink](https://firelink.devshift.net/namespace/reserve)** — a web UI for
  reserving, listing, extending, and releasing ephemeral namespaces.
- **[InScope / Firelink](https://inscope.corp.redhat.com/firelink)** — the
  Red Hat internal portal for ephemeral namespace management (requires VPN).

These UIs are useful for manual testing and debugging, but the
`ephemeral-namespace` workflow handles everything automatically in CI.

## How the Workflow Works

The `ephemeral-namespace` workflow is a
[multi-stage test](/architecture/step-registry/) with two steps and an empty test
phase that you fill with your own test logic:

```
┌──────────────────────────────────────────────────────┐
│                  ephemeral-namespace                  │
│                     (workflow)                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─── pre ────────────────────────────────────────┐  │
│  │  ephemeral-namespace-reserve                   │  │
│  │  • Installs bonfire                            │  │
│  │  • Logs in to the ephemeral cluster            │  │
│  │  • Reserves a namespace from the pool          │  │
│  │  • Writes kubeconfig + namespace to SHARED_DIR │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─── test ───────────────────────────────────────┐  │
│  │  (empty — you inject your test steps here)     │  │
│  │  • Read KUBECONFIG from SHARED_DIR             │  │
│  │  • Run tests in the reserved namespace         │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─── post ───────────────────────────────────────┐  │
│  │  ephemeral-namespace-release  [best_effort]    │  │
│  │  • Releases the namespace back to the pool     │  │
│  │  • Fallback: patches NamespaceReservation CR   │  │
│  │  • Always runs, even if tests fail             │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Pre Phase: Reserve

The `ephemeral-namespace-reserve` step:

1. Reads cluster credentials from a Vault-managed secret
2. Installs `crc-bonfire` into an isolated Python virtualenv
3. Creates a dedicated kubeconfig (so it does not overwrite the CI-provided one)
4. Logs in to the ephemeral cluster with `oc login`
5. Calls `bonfire namespace reserve` with your configured pool, duration, and
   timeout
6. Writes three files to `SHARED_DIR` for your test steps to consume (see
   [SHARED_DIR Outputs](#shared_dir-outputs) below)

### Test Phase: Your Steps

The test phase is intentionally empty. You inject your own test step references
here. Your steps can use the kubeconfig and namespace name written to
`SHARED_DIR` to interact with the reserved namespace.

### Post Phase: Release

The `ephemeral-namespace-release` step runs as `best_effort`, meaning it
**always executes** — even when the test phase fails. It:

1. Reads the namespace name from `SHARED_DIR/ephemeral-namespace`
2. Logs in to the ephemeral cluster independently (it does not rely on state
   from the pre step)
3. Calls `bonfire namespace release` to return the namespace to the pool
4. If bonfire fails, falls back to patching the `NamespaceReservation` CR
   directly with `{"spec":{"duration":"0s"}}`

## Quick Start

Add the following to your repository's `ci-operator` configuration to use the
workflow:

{{< highlight yaml >}}
tests:
- as: my-ephemeral-test
  steps:
    workflow: ephemeral-namespace
    test:
    - ref: my-test-step
{{< / highlight >}}

In your test step's commands script, read the connection details from
`SHARED_DIR`:

{{< highlight bash >}}
#!/bin/bash
set -euo pipefail

# Point kubectl/oc at the ephemeral cluster
export KUBECONFIG="${SHARED_DIR}/ephemeral-kubeconfig"
NAMESPACE=$(cat "${SHARED_DIR}/ephemeral-namespace")

echo "Running tests in namespace: ${NAMESPACE}"
oc project "${NAMESPACE}"

# Deploy your application into the namespace
# (use your project's deployment tooling here)

# Run your tests
make test-integration
{{< / highlight >}}

## SHARED_DIR Outputs

The reserve step writes these files for your test steps to consume:

|File|Content|
|:---|:---|
|`ephemeral-namespace`|The reserved namespace name (e.g. `ephemeral-abc123`).|
|`ephemeral-kubeconfig`|A kubeconfig authenticated to the ephemeral cluster, with the context set to the reserved namespace.|
|`ephemeral-cluster-server`|The API server URL of the ephemeral cluster.|

## Environment Variables

All parameters have sensible defaults. Override them at the workflow, chain, or
test level using the `env` stanza in your `ci-operator` configuration:

|Variable|Default|Description|
|:---|:---|:---|
|`BONFIRE_NAMESPACE_POOL`|`default`|Namespace pool to reserve from. Maps to `bonfire namespace reserve --pool`.|
|`BONFIRE_NAMESPACE_DURATION`|`1h`|How long the reservation lasts. Accepts values from `30m` to `14d`. Format: `XhYmZs`.|
|`BONFIRE_NAMESPACE_TIMEOUT`|`600`|Maximum seconds to wait for a namespace to become available in the pool.|
|`BONFIRE_NAMESPACE_REQUESTER`|`$JOB_NAME`|An identifier recorded on the reservation. Defaults to the Prow job name.|
|`BONFIRE_VERSION`|`>=4.18.0`|PyPI version specifier for `crc-bonfire`. Both the reserve and release steps must use the same version.|

### Example: Overriding Variables

{{< highlight yaml >}}
tests:
- as: my-test
  steps:
    workflow: ephemeral-namespace
    test:
    - ref: my-test-step
    env:
      BONFIRE_NAMESPACE_POOL: minimal
      BONFIRE_NAMESPACE_DURATION: 2h
      BONFIRE_NAMESPACE_TIMEOUT: "900"
{{< / highlight >}}

## Required Secret

The workflow requires the `ephemeral-bot-svc-account` secret in the
`test-credentials` namespace. This secret is mounted at
`/usr/local/ci-secrets/ephemeral-cluster` in both the reserve and release steps.

|Key|Description|
|:---|:---|
|`oc-login-token`|An OAuth or service-account token for the ephemeral cluster.|
|`oc-login-server`|The API server URL (e.g. `https://api.crc-eph.r9lp.p1.openshiftapps.com:6443`).|

{{< alert title="Warning" color="warning" >}}
This secret is pre-configured for use in OpenShift CI. If you are seeing
authentication errors, the token may have expired and needs rotation. Contact
the workflow owners for assistance.
{{< /alert >}}

## Full Example: ci-operator Configuration

The following is a complete `ci-operator` configuration that reserves an
ephemeral namespace, runs integration tests, and releases the namespace:

{{< highlight yaml >}}
tests:
- as: integration
  steps:
    workflow: ephemeral-namespace
    test:
    - as: run-tests
      from: src
      commands: |
        export KUBECONFIG="${SHARED_DIR}/ephemeral-kubeconfig"
        NAMESPACE=$(cat "${SHARED_DIR}/ephemeral-namespace")
        oc project "${NAMESPACE}"

        # Deploy your application into the namespace
        # (use your project's deployment tooling here)

        pytest tests/integration/ -v
      resources:
        requests:
          cpu: 100m
          memory: 256Mi
    env:
      BONFIRE_NAMESPACE_POOL: default
      BONFIRE_NAMESPACE_DURATION: 1h
{{< / highlight >}}

## Troubleshooting

### Namespace reservation times out

The ephemeral pool may be full. You can:
- Increase `BONFIRE_NAMESPACE_TIMEOUT` to wait longer.
- Check pool utilization using the
  [Firelink UI](https://firelink.devshift.net/namespace/reserve) or by running
  `bonfire namespace list --available`.
- Try a different pool by setting `BONFIRE_NAMESPACE_POOL`.

### Release step fails

The release step includes a fallback mechanism that patches the
`NamespaceReservation` CR directly if bonfire fails. If both mechanisms fail:

1. Check the CI job logs for the `ephemeral-namespace-release` step.
2. Manually release the namespace: `bonfire namespace release <namespace> -f`.
3. As a last resort, patch the CR:
   `oc patch namespacereservation <name> --type=merge -p '{"spec":{"duration":"0s"}}'`.

### Authentication errors

Verify that the `ephemeral-bot-svc-account` secret contains valid credentials.
The service-account token may have expired and need rotation. Contact the
workflow owners listed in the
[OWNERS file](https://github.com/openshift/release/blob/master/ci-operator/step-registry/ephemeral/OWNERS).

### Tests cannot reach the ephemeral cluster

Make sure your test step sets `KUBECONFIG` to the file provided in `SHARED_DIR`:

{{< highlight bash >}}
export KUBECONFIG="${SHARED_DIR}/ephemeral-kubeconfig"
{{< / highlight >}}

Do **not** rely on the default `$KUBECONFIG` environment variable — that points
to the CI cluster, not the ephemeral cluster.

## Further Reading

- [Bonfire documentation](https://github.com/RedHatInsights/bonfire#readme) —
  CLI reference for deploying applications and managing namespaces.
- [Firelink](https://firelink.devshift.net/namespace/reserve) — web UI for
  managing ephemeral namespaces.
- [InScope / Firelink](https://inscope.corp.redhat.com/firelink) — Red Hat
  internal ephemeral namespace portal.
- [Multi-Stage Tests and the Step Registry](/architecture/step-registry/) —
  how workflows, chains, and steps work in OpenShift CI.
- [Adding and Changing Step Registry Content](/how-tos/adding-changing-step-registry-content/) —
  how to contribute new steps and workflows.
- [Ephemeral Namespace Operator](https://github.com/RedHatInsights/ephemeral-namespace-operator) —
  the operator that manages namespace pools on the ephemeral cluster.

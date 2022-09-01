---
title: "Observer Pods"
description: Description of how observer pods work
---

## Motivation
Observer pods have been requested and designed to make life easier for an e2e test author who wants to:
- have an active non-intrusive 'observing agent' throughout the entire execution of an e2e test
- gather information from a cluster (including ephemeral instances)
- get the previous functionalities without having to make changes to every single step of the e2e test

Observer pods are named as such because they are supposed to observe without affecting the execution of the current test.  
If an observer pod fails, the failure will still be visible inside logs, but the test won't be affected.

Additional docs:
- [openshift/enhancements/test-platform/e2e-observer-pods.md](https://github.com/openshift/enhancements/blob/master/enhancements/test-platform/e2e-observer-pods.md)

## Different ways of defining an observer
There are different ways of defining observers and including/excluding them in a multi-step test workflow:

### Embedded in a test definition
{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    test:
    - as: first-step
      commands: echo 'this is a test'
      ...
      observers:
      - name: my-awesome-observer
        # Only one of the following two should be specified
        from: cli # This image will be used to run the observer
        # Literal image stream tag that will be used to run the observer
        from_image:
          ...
        # Commands that are going to be executed
        commands: echo 'this is an observer' 
        # Regular resources constraint definition for a pod running this observer
        resources: 
          ...
{{< / highlight >}}

### Referring to existing observers
It is possible to reference observers that already exist:
{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    pre:
      ...
    test:
      ...
    post:
      ...
    observers:
      enable:
      # Observers 'observer-1' and 'observer-2' have to exist somewhere 
      # inside the step registry
      - observer-1
      - observer-2
{{< / highlight >}}

Observers' definitions are additive, which means the final set of observers will be the union between any
observer defined inside test step definition and the ones defined in the `observers` stanza.

Assuming the following configuration:
{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    test:
    - as: first-step
      commands: echo 'this is a test'
      ...
      observers:
      - observer-3
    observers:
      enable:
      - observer-1
      - observer-2
{{< / highlight >}}

The final set of observers will be: `{ observer-3, observer-1, observer-2 }`.
The ordering matters: observers are added to the set as they are encountered, from the top to the bottom of the configuration.

### Disable a predefined observer
The `observers` stanza found inside `steps` is as follow:
{{< highlight yaml >}}
observers:
  # List of observers that will be included in the test execution
  enable:
  - observer-1
  - observer-2
  # List of observers that *won't* be included in the test execution
  disable:
  - observer-3
{{< / highlight >}}

The `disable` stanza lets the user selectively decide which observers to exclude.
Assuming the following configuration:
{{< highlight yaml >}}
tests:
- as: e2e
  steps:
    test:
    - as: first-step
      commands: echo 'this is a test'
      ...
      observers:
      - observer-3
    observers:
      enable:
      - observer-1
      - observer-2
      disable:
      - observer-3
{{< / highlight >}}
The final set of observers will be: `{ observer-1, observer-2 }`.

### Writing from scratch inside Step Registry
Writing an observer as a step inside the registry looks almost like a regular test.

The Observer's definition file must have `-observer.yaml` suffix. The configuration looks like:
{{< highlight yaml >}}
observer:
  name: observer
  # Only one of the following two should be specified
  from: os # This image will be used to run the observer
  # Literal image stream tag that will be used to run the observer
  from_image:
    ...
  # This file has to be inside the same observer folder
  commands: observer-commands.sh
  resources:
    requests:
      cpu: 10m
      memory: 10Mi
  documentation: |-
    A simple observer
{{< / highlight >}}

As it is for regular tests, the observer's payload file must have `-commands` suffix (file extension has not
been taken into account this time): 
{{< highlight bash >}}
#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail
set -o xtrace

echo "I'm going to silently observe your test"
{{< / highlight >}}

The final folder content would be, in this case:
- `observer-observer.yaml`
- `observer-commands.sh`

## Execution Model
Observers are started before any test from the `pre:` chain starts and they stay alive until
the last step from the `test:` chain completes.  

When an observer fails, its failure will be reported inside logs and jUnit files, but the test
will keep going without being affected at all.  

When the last test from `test:` chain finishes, observers are going to be deleted by Kubernetes: see [here](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination) for more details on how pods termination works. After the test completes, no 'observer pods' pods will be found inside `ci-op-xxxx` namespace.

Artifacts are collected as if they were regular tests.

It's a good habit to write the observer payload following this approach:
{{< highlight bash >}}
#!/bin/bash

set -o errexit
set -o nounset
set -o pipefail
set -o xtrace

function cleanup() {
    echo 'this will be executed at the end'
}

trap cleanup EXIT

# Do something here

# An observer could be killed in the middle of its execution:
# firstly, Kubernetes sends it a SIGTERM and then, after a grace period of n seconds, 
# it just kills (SIGKILL) it.
...
{{< / highlight >}}
## Features
### `$SHARED_DIR`
`$SHARED_DIR` is still mounted on observer pods but it is *read-only*.
As regular tests modify it, Kubernetes does the heavy lift of propagating the changes.

The following example shows what to expect from the observer's point of view when a test writes something on
the `$SHARED_DIR`.  

Timeline of events:
- Observer `observer-1` starts, `$SHARED_DIR` is empty
- Test `test-1` starts
- Test `test-1` writes file `dummy.txt` inside `$SHARED_DIR`
- Test `test-1` ends gracefully
- After a variable amount of time (up to ~2 minutes) Kubernetes updates `$SHARED_DIR` content on `observer-1`
- At this point, the observer pod `observer-1` sees `dummy.txt`

### `$KUBECONFIG`
Observers will get a `read-write` kubeconfig copy as soon as it is provided by some tests or any other agent
at the path specified in `$KUBECONFIG`.

It is safe to check for its existence or not by invoking the following code:
{{< highlight bash >}}
while [ ! -f "${KUBECONFIG}" ]; do
  printf "%s: waiting for %s\n" "$(date --utc --iso=s)" "${KUBECONFIG}"
  sleep 10
done
printf "%s: acquired %s\n" "$(date --utc --iso=s)" "${KUBECONFIG}"
{{< / highlight >}}

Kubeconfig is treated differently from `$SHARED_DIR`, so observers could receive it at any time. Please do not make any assumptions about the order of events.

---
title: "CI Operator Internals"
description: A detailed view of some aspects of the ci-operator implementation, intended for developers working on its source code.
---

This section describes in detail some aspects of the implementation of
`ci-operator` and associated programs, with the intent of serving as an
auxiliary guide for developers working with the
[`openshift/ci-tools`](https://github.com/openshift/ci-tools.git) repository.

# Execution graph

`ci-operator` is at its core a task scheduling program. The input configuration
is processed and used to build a task graph, which is then executed until
completion, failure, or interruption. Thus, the execution flow of `ci-operator`
can be divided in these major phases:

1. input processing
2. task graph creation
3. task graph execution
4. cleanup

In the code base, these phases correspond to the following modules in the
[`pkg`](https://github.com/openshift/ci-tools/tree/master/pkg) directory:

- [`api`](https://github.com/openshift/ci-tools/tree/master/pkg/api):
  Go types used by all phases
- [`load`](https://github.com/openshift/ci-tools/tree/master/pkg/load):
  I/O operations for types
- [`registry`](https://github.com/openshift/ci-tools/tree/master/pkg/registry):
  configuration resolution using the step registry
- [`config`](https://github.com/openshift/ci-tools/tree/master/pkg/config):
  input configuration processing
- [`validation`](https://github.com/openshift/ci-tools/tree/master/pkg/validation):
  input configuration validation
- [`defaults`](https://github.com/openshift/ci-tools/tree/master/pkg/defaults):
  mapping from inputs to tasks
- [`steps`](https://github.com/openshift/ci-tools/tree/master/pkg/steps):
  definitions for each task type, task execution

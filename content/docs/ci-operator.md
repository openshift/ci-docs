---
title: "Ci Operator"
date: 2020-10-05T11:14:39-04:00
draft: false
---


*What is ci-operator and how does it work?*

`ci-operator` is a highly opinionated test workflow execution engine that knows about how OpenShift is built, released and installed. `ci-operator` hides the complexity of assembling an ephemeral OpenShift 4.x release payload, thereby allowing authors of end-to-end test suites to focus on the content of their tests and not the infrastructure required for cluster setup and installation.

`ci-operator` allows for components that make up an OpenShift release to be tested together by allowing each component repository to test with the latest published versions of all other components. An integration stream of container images is maintained with the latest tested versions of every component. A test for any one component snapshots that stream, replaces any images that are being tested with newer versions, and creates an ephemeral release payload to support installing an OpenShift cluster to run end-to-end tests.

In addition to giving first-class support for testing OpenShift components, `ci-operator` expects to run in an OpenShift cluster and uses OpenShift features like Builds and ImageStreams extensively, thereby exemplifying a complex OpenShift user workflow and making use of the platform itself. Each test with a unique set of inputs will have a Namespace provisioned to hold the OpenShift objects that implement the test workflow.

`ci-operator` needs to understand a few important characteristics of any repository it runs tests for. This document will begin by walking through those characteristics and how they are exposed in the configuration. With an understanding of those building blocks, then, the internal workflow of ci-operator will be presented.

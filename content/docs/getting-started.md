---
title: "Getting Started"
date: 2020-10-05T10:49:33-04:00
draft: false
---

*What is the Multistage Test and the Test Step Registry?*
The multistage test style in the `ci-operator` is a modular test design that allows users to create new tests by combining smaller, individual test steps. These individual steps can be put into a shared registry that other tests can access. This results in test workflows that are easier to maintain and upgrade as multiple test workflows can share steps and don’t have to each be updated individually to fix bugs or add new features. It also reduces the chances of a mistake when copying a feature from one test workflow to another.

To understand how the multistage tests and registry work, we must first talk about the three components of the test registry and how to use those components to create a test:

* Step: A step is the lowest level component in the test step registry. It describes an individual test step.
* Chain: A chain is a registry component that specifies multiple steps to be run. Any item of the chain can be either a step or another chain.
* Workflow: A workflow is the highest level component of the step registry. It contains three chains: pre, test, post.

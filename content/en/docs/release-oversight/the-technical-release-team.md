---
title: "The Technical Release Team"
description: The TRT's role in improving payload quality.
---

### Background
The Technical Release Team (TRT) was formed during the OpenShift 4.5 development cycle because our existing signals for product quality were failing us.  Blocker bugs were imprecise and the signal from CI was unclear.  Originally staffed by volunteers from across OpenShift Engineering, with OpenShift 4.10 development it has become a formally staffed team.

### What we do today
One way to understand the role of the TRT is to think of it as a form of Site Reliability Engineer for OpenShift payloads.  Our goal is to ensure the highest sustainable rate of development.  We define sustainable as not letting regressions compound and therefore our aim is to catch them as quickly as possible (hours not days).  In the same way a SRE might need to revert a change or apply a patch to disable a feature in light of an outage, at times we work with teams to revert changes that can be proven to have introduced a regression.

To assist in this detection we build tools like [sippy](https://sippy.ci.openshift.org/) and collaborate on improvements to the [release controller](https://github.com/openshift/release/tree/master/core-services/release-controller).  We investigate elusive problems in our tests and file PRs against dozens of repositories spanning as many teams.

### How we do it
For OpenShift 4.10 development our focus has been on creating a form of "quality ratchet" for OpenShift upgrades rather that only fixing tests.  Our current ratchet is implemented by a number of tests and tools that have increased the speed of regression detection in our nightly development payloads.
* [A suite of tests that detect service disruption](https://github.com/openshift/origin/tree/master/test/extended/util/disruption): On one level these classes of tests may appear to fail randomly.  The goal of the following tools to is find the source of the disruption.
* [The test that monitors this suite at upgrade time](https://github.com/openshift/origin/blob/0c86019e378384814e0a66157a3b7a0afd795915/test/e2e/upgrade/upgrade.go#L145): We've learned that, while the overall system is highly resilient to availability "blips", they create noise that makes understanding our CI results extremely difficult and mask regressions.  
* [The Job Run Aggregator](https://github.com/openshift/ci-tools/tree/master/cmd/job-run-aggregator): A tool we use to run multiple instances of select jobs and aggregrate the disription data.  With the right math confidence intervals can be created to know whether or not a given payload has regressed—even in spite of test flakes.  A detailed explanation of the rationale and math behind its implementation can be found [here](/docs/release-oversight/improving-ci-signal).
* [Alerting](/docs/release-oversight/alerting) helps teams stay aware of the health of their jobs.

### Why are regressions happening anyway?  Why not catch them pre-merge?
We're moving that direction.  Once we catch a regression we're able to work with team on how to use the tooling mentioned above to test the fix pre-merge.

As for not catching it in the first place, it's mostly a result of the size of OpenShift and all the layered offerings.  Hundreds of developers are committing many thousands of lines of code each day and it's unrelistic to run CI blocking jobs for the myriad permutations of cloud provides, layered products, deployment topologies and features.  Instead, a fully integrated payload is now created roughly every two hours that undergoes the battery of [release gating](/docs/architecture/release-gating) jobs.


### Where we're going
There may still be a rotational aspect of the team even once the long lived team finally formed.  

Speaking of the new team, a few things will change.  Besides the obvious things like having a manager and maybe an agile practitioner, a staffed team will be able to avoid the sort of post GA context shifting as new volunteers ramp up.  As OpenShift grows we can’t continue to expect that the fundamental changes we need will map nicely to release dates.  Upstream work is a prime example.  It’s built on trust and best served by a team that’s going to see a feature through end to end.  Taking an idea from Kubernetes Enhancement Proposal to merged implementation is impossible unless upstream knows you’ll be around to maintain it.

We should acknowledge that the required handover between volunteer teams had a significant benefit though.  With a more stable team structure we run the risk of losing the knowledge transfer that naturally happens.  We’ll come up with a form of rotational or dotted-line connection with all pillars to ensure that the changes we need to happen actually happen.  We aren’t going to be the team that runs around telling people their job is broken though.  We’re the team that will help the owners be the first to know and serve as their technical backstop if help is needed.

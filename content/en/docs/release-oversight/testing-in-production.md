---
title: "Testing in \"production\""
description: Running our development tests on our latest stable sprint release.
---

### Background
Like security, quality comes in layers.  In addition to the direct signal from our CI, [release gate testing](/docs/architecture/release-gating/) and Quality Engineering, we're now testing our sprint output on a critical piece of our own infrastructure.

### Our philosophy on failure
It's important to understand we believe breaking ourselves first is a form of success.  When we catch mistakes we can make adjustments before our next big release.  Failing a sprint is a gift in this sense.  In practice this means we hold retrospectives with the involved teams to identify our problems that need to be addressed.  This class of work will be prioritized over new feature development.

### Sprint success or failure
There are couple ways we judge the success or a failure of a sprint:

* Did we have a build on time?
* Were any changes required by the administrator missing an [admin ack](https://docs.openshift.com/container-platform/4.9/updating/updating-cluster-prepare.html#update-preparing-migrate_updating-cluster-prepare)?
* Did we find a significant problem that forced us to remove the production cluster from rotation?

### Selecting the build
The selection process is quite simple.  On the last Wednesday of each sprint the [Technical Release Team](/docs/release-oversight/the-technical-release-team/) (TRT) will select an accepted payload from the last two days.  If no payload is readily available and time allows for deeper investigation, the TRT may manually accept a payload.  This involves carefully accounting for extraneous circumstances that can lead to widespread payload blockage.  Cloud provider or other infrastructure related problems are just two examples.

From there Quality Engineering will run additional tests.  Barring any new surprises Test Platform will be notified that a release is ready.

It's worth noting that we may create a dedicated channel for managing these releases through the [Update Service](https://docs.openshift.com/container-platform/4.7/updating/understanding-the-update-service.html) in the upcoming months.  At the present we classify the sprint payload as an *fc* build which notifies Quality Engineering that additional testing is needed.

### The environment
We've selected one of our build farm clusters to run the output of each sprint.  This is a critical piece of infrastructure that all development teams are motivated to keep working.  In this document we'll refer to this cluster as the *sacrificial cluster*.

### Investigating problems
The TRT has admin access to the sacrificial cluster for debugging purposes.  As needed this access can be temporarily granted by Test Platform to any other development team that needs it.  Temporary configuration changes are allowed for experiments but anything needed to persist will require failing the sprint.

### Hotfixes
Hotfixes are possible but not desired.  Changes for the sole purpose of gathering more data are preferred over changes in functionality.  Before we resort to patching a problem we'll default to [reverting the change](/docs/release-oversight/improving-ci-signal/).  Changes like this are best done as part of the subsequent sprint release.

### When things go wrong the sacrificial cluster is removed from rotation
The Test Platform team maintains the infrastructure that powers our CI builds.  When there are major outages they already have an incident management process in place.  What's different now is that the TRT can detect subtle degradations as a result of sprint upgrades.  In most of these cases the TRT contacts Test Platform via their helpdesk bot to request the sacrificial cluster be removed from rotation.  Behind the scenes a Jira is created for tracking.

This Jira is the rallying point for incident management.  Any changes made to the system are recorded in a root cause analysis document.  For example, rather than applying an actual hotfix (implying an entirely new upgrade) the TRT may decide to allow the cluster to enter a form of "rescue mode".  By this we mean disabling the cluster version operator and manually deploying isolated components.  Bugs that ship as part of our operating system content will not lend themselves to this sort of patching and will be handled on a case by case basis (See the [Reasonable effort](/docs/release-oversight/testing-in-production/#reasonable-effort-will-be-made-to-bring-the-sacrificial-cluster-back-into-rotation) section for more explanation).

### Failover is not necessarily a failure
It's also not necessarily urgent.  In some cases it may be requested simply to test a theory after other easier options have been exhausted.  As long as these investigations don't exceed half the sprint we'll still consider the sprint a success.

That said, if somehow the failover process doesn't work, and the rest of CI begins to degrade, the situation would indeed become urgent.  In that case putting the sacrificial cluster back into rotation may be the best course of action (even if it partially degrades our CI signal).  If that's not immediately possible the TRT will focus on whatever is needed to allow that to happen.  Test Platform will focus on whatever can be done to minimize impact to the rest of the CI farm.


### Sometimes we lack data
Let's be honest, sometimes we know there's a problem but we lack the means to isolate it.  In those cases the TRT will duplicate a subset of CI jobs and schedule them to run on the sacrificial cluster for further monitoring.  To avoid disrupting pull requests in development these jobs will all be [periodics](/docs/how-tos/notification/).

### Reasonable effort will be made to bring the sacrificial cluster back into rotation
Running the sacrificial cluster with a subset of duplicate jobs is not ideal.  That would turn our production cluster into more of a staging environment and is therefore against our goals.

At the same time, we must ensure that bringing the sacrificial cluster back into rotation doesn't overload any team to the point of preventing them from doing other important work.  For example, the TRT already dedicates one person as a form of *payload* reliability engineer (henceforth called the *Watcher*).  The class of investigations needed to isolate problem in sprint upgrades are too time consuming to be the responsibility of the Watcher.  If another engineer is available to apply a workaround the TRT can request the sacrificial cluster be brought back into rotation.  The goal in this case is for the sacrificial cluster to spend as much time in rotation as possible and hopefully catch any problems that could put the next sprint at risk.

### Feedback
Two feedback loops are important to the success of this effort.  We covered the first in our [philosophy on failure](/docs/release-oversight/testing-in-production/#our-philosophy-on-failure).  We refer to these internally as our *reaction plan*.

The second form of feedback provides space for the TRT and Test Platform to improve the way they work together.  This primarily involves weekly discussion on the CI architecture call, but from time to time will include sprint retrospectives.

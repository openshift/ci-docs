---
title: "Useful Links"
description: Useful links to build farm clusters, hosted services, CI APIs and human contacts.
---

# Clusters

The clusters that currently comprise CI are:

* [api.ci](https://console.svc.ci.openshift.org/): legacy Openshift 3.11 cluster in GCP. Job execution is being migrated out of it.
* [app.ci](https://console-openshift-console.apps.ci.l2s4.p1.openshiftapps.com/): Openshift Dedicated 4.x cluster containing most Prow services.
* [build01](https://console.build01.ci.openshift.org/): Openshift 4.x cluster in AWS that executes a growing subset of the jobs.
* [build02](https://console.build02.ci.openshift.org/): Openshift 4.x cluster in GCP that executes a growing subset of the jobs.
* `vsphere`: external cluster used for vSphere tests, not managed by DPTP.

Except for `vsphere`, these clusters use Github OAuth authentication: all members of the Openshift organization in Github can log in.

# Services

Below is a non-exhaustive list of CI services.

* [prow.ci.openshift.org](https://prow.ci.openshift.org/): main Prow dashboard with information about jobs, pull requests, the merge queue, etc.
* [amd64.ocp.releases.ci.openshift.org](https://amd64.ocp.releases.ci.openshift.org/): OCP AMD 64 release status page.
* [ppc64le.ocp.releases.ci.openshift.org](https://ppc64le.ocp.releases.ci.openshift.org/): OCP PowerPC 64 LE release status page.
* [s390x.ocp.releases.ci.openshift.org](https://s390x.ocp.releases.ci.openshift.org/): OCP S390x release status page.
* [amd64.origin.releases.ci.openshift.org](https://amd64.origin.releases.ci.openshift.org/): OKD release status page.
* [search.ci.openshift.org](https://search.ci.openshift.org/): search tool for error messages in job logs and Bugzilla bugs.
* [sippy.ci.openshift.org](https://sippy.ci.openshift.org/): CI release health summary.
* [bugs.ci.openshift.org](https://bugs.ci.openshift.org/): Bugzilla bug overviews, backporting and release viewer.

# Contact

DPTP maintains several means of contact:

* Slack
    * `#announce-testplatform`: general announcements and outages. Usage is limited to the DPTP team, please do not post messages there.
    * `#forum-testplatform`: general queries and discussion for the test platform. For general assistance, ping `@dptp-helpdesk`. For reporting an outage, ping `@dptp-triage`.
    * `#4-dev-triage`: queries and discussion for CI issues that are not caused by the test platform.
    * `#forum-release-controller`: queries and discussion for the [release-controller](https://github.com/openshift/release-controller), responsible for generating Openshift release/update payloads and displaying the release status pages.
* [Jira](https://issues.redhat.com/projects/DPTP)
    * [Story template](https://issues.redhat.com/browse/DPTP-417) for feature requests.
    * [Bug template](https://issues.redhat.com/browse/DPTP-419) for bugs and issues.
    * [Consulting template](https://issues.redhat.com/browse/DPTP-897) for long-term, asynchronous discussion.

---
title: "Useful Links"
description: Useful links to build farm clusters, hosted services, CI APIs and human contacts.
weight: 1
---

# Clusters
The clusters that currently comprise CI are:

{{< rawhtml >}}
<ul id="ul_clusters">
</ul>
{{< /rawhtml >}}

Except the ones not managed by DPTP, Red Hat SSO is enabled to login onto these clusters.
GitHub Users in OpenShift organization who have no Red Hat SSO can still use Prow services to do CI tasks but they cannot login into these clusters.

# Services

Below is a non-exhaustive list of CI services.

* [prow.ci.openshift.org](https://prow.ci.openshift.org/): main Prow dashboard with information about jobs, pull requests, the merge queue, etc.
* [amd64.ocp.releases.ci.openshift.org](https://amd64.ocp.releases.ci.openshift.org/): OCP AMD 64 release status page.
* [ppc64le.ocp.releases.ci.openshift.org](https://ppc64le.ocp.releases.ci.openshift.org/): OCP PowerPC 64 LE release status page.
* [s390x.ocp.releases.ci.openshift.org](https://s390x.ocp.releases.ci.openshift.org/): OCP S390x release status page.
* [multi.ocp.releases.ci.openshift.org](https://multi.ocp.releases.ci.openshift.org/): OCP Multi-arch release status page.
* [amd64.origin.releases.ci.openshift.org](https://amd64.origin.releases.ci.openshift.org/): OKD release status page.
* [search.ci.openshift.org](https://search.ci.openshift.org/): search tool for error messages in job logs and Bugzilla bugs.
* [sippy.dptools.openshift.org](https://sippy.dptools.openshift.org/): CI release health summary.
* [bugs.ci.openshift.org](https://bugs.ci.openshift.org/): Bugzilla bug overviews, backporting and release viewer.
* [steps.ci.openshift.org](https://steps.ci.openshift.org/): [Step registry](/docs/architecture/step-registry/) viewer.

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

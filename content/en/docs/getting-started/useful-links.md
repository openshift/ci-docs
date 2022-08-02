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
* [arm64.ocp.releases.ci.openshift.org](https://arm64.ocp.releases.ci.openshift.org/): OCP ARM 64 release status page.
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
    * `#forum-testplatform`: general queries and discussion for the test platform. Workflows exist within the channel (click on `+` by message box to see them) to interact with the Test Platform team:
      * `Ask a Question`: general question for the team. Please provide as many details and links as possible to help us answer quickly.
      * `Report CI Outage`: if there is a systemic outage in the CI use this workflow, and we will look at it ASAP.
      * `Request PR Review`: if `dptp` is listed as approvers for one or more files in your PR use this to notify us of your request for review.
      * `Report a Bug`: opens a dialog box to create a detailed Jira bug card.
      * `Request an Enhancement`: opens a dialog box to create a detailed Jira enhancement card.
      * `Request a Consultation`: opens a dialog box to create a detailed Jira consultation card.
    * `#4-dev-triage`: queries and discussion for CI issues that are not caused by the test platform.
    * `#forum-release-controller`: queries and discussion for the [release-controller](https://github.com/openshift/release-controller), responsible for generating Openshift release/update payloads and displaying the release status pages.
* [Jira](https://issues.redhat.com/projects/DPTP)
    * [Story template](https://issues.redhat.com/browse/DPTP-417) for feature requests.
    * [Bug template](https://issues.redhat.com/browse/DPTP-419) for bugs and issues.
    * [Consulting template](https://issues.redhat.com/browse/DPTP-897) for long-term, asynchronous discussion.

## Presentations

The following are public and internal presentations from DPTP:

* [_Dogfooding Openshift with our CI infrastructure_](https://devconfcz2018.sched.com/event/DJX4/dogfooding-openshift-with-our-ci-infrastructure),
  Michalis Kargakis (2018, [recording](https://www.youtube.com/watch?v=rLLEjodflYw)).
* [_Intro: Testing SIG_](https://kccna18.sched.com/event/GrbJ/intro-testing-sig-aaron-crickenberger-google-steve-kuznetsov-red-hat),
  Steve Kuznetsov (2018, [recording](https://www.youtube.com/watch?v=7-_O41W3FRU)).
* [_CI for OpenShift: Prow, ci-operator and the future_](https://devconfcz2019.sched.com/event/Jcmg/ci-for-openshift-prow-ci-operator-and-the-future),
  Petr Muller (2019, [recording](https://www.youtube.com/watch?v=ANy-fZIFVlY)).
* [_Deep Dive: Prow_](https://kccncna19.sched.com/event/UahY/deep-dive-prow-steve-kuznetsov-red-hat-alvaro-aleman-loodse),
  Alvaro Aleman, Steve Kuznetsov (2019, [recording](https://www.youtube.com/watch?v=_MQdTKn1nfI)).
* [_CI that CIs itself: Rehearsals in OpenShift CI_](https://devconfcz2020a.sched.com/event/YOuB/ci-that-cis-itself-rehearsals-in-openshift-ci),
  Petr Muller (2020, [recording](https://www.youtube.com/watch?v=BMB7I2eqMK0)).
* [_Challenges of OpenShift CI going multi-cluster_](https://devconfcz2022.sched.com/event/siIM/challenges-of-openshift-ci-going-multi-cluster),
  Hongkai Liu, Petr Muller (2022,
  [recording](https://www.youtube.com/watch?v=aI7M_jqeQhg),
  [slides](https://static.sched.com/hosted_files/devconfcz2022/03/%5BDevConf2022%5DChallenges%20of%20OpenShift%20CI%20going%20multi-cluster.pdf)).
* _`ci-operator` deep dive_, Petr Muller (2022, [recording](https://drive.google.com/file/d/1ye_Xim2oV4iJaQtBQrDUjre3vwDvZKDT/)).
* _Pod Scaler_, Stephen Goeddel (2022,
  [recording](https://drive.google.com/file/d/1H8ld2UHvZWwtMzuzjQ610PeT61kvPCQw/),
  [slides](https://docs.google.com/presentation/d/1lcYT-WtdNsiLGmgvme7srSVWDGqUUZSxbzMuJiFI6Rs/)).
* _`ci-operator`_, Bruno Barcarol Guimarães (2022,
  [recording](https://drive.google.com/file/d/1hYgYNBBlVUdSiyFRa9R6aGy5SbDaPLRY/),
  [slides](https://drive.google.com/file/d/1ql2MOFRIsvPzgg3iMwjJTy6fRS9G7sDG/),
  [slides (with notes)](https://drive.google.com/file/d/1Jxu9pK3Ujw_ZAgxdd7b1dCVgjAP0JIr_/)).

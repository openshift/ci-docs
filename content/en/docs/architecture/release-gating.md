---
title: "OpenShift Release Testing"
description: An overview of how CI jobs are used to test OpenShift and how these configurations can be changed.
---

## Overview

CI jobs are the backbone of maintaining and improving release quality. The primary 
purpose of any CI job is to identify regressions early and reliably, preventing 
issues from impacting customers.

To achieve this, OpenShift employs a multi-layered approach to regression detection 
via release blocking jobs. Each layer is designed to address different stages of the
development and release cycle, with trade-offs in detection speed and cost.

We have three primary ways to detect regressions: (1) pre-merge via presubmits, (2) 
blocking release payloads jobs, and (3) component readiness.

### Identifying Which Jobs Qualify

Candidate jobs for release blocking signal should at a minimum be:

1. Useful: is testing a commonly used variation of the product that requires dedicated testing, is testing a project or
   product that will be widely used on top of OpenShift, or uses OpenShift APIs, or can provide
   useful feedback via automated testing to OpenShift about whether the project continues to work
2. Stable: reached a maturity point where the job is expected to have a stable pattern and is known to
   “work” (components that are prototypes or still iterating towards an “alpha” would not be blocking)
3. Testable: is able to create an install or upgrade job that runs a test suite that can verify the project within a
   reasonable time period (1h) with low flakiness (<1% flake rate)

Good candidates include:

* Jobs that verify upgrade success
* Jobs with a high signal-to-noise ratio (high pass rates)
* Products that will ship on top of OpenShift
* Projects or internal tools that depend on OpenShift APIs heavily
* Community projects being evaluated for inclusion into OpenShift or the portfolio

For layered products that extend the control plane of the cluster, they must be able
to tie into OpenShift's CI and block releases. For example, OCS is a part of the OpenShift platform,
and if an upgrade breaks OCS, we have broken part of our platform. Extending our testing to
these components is a requirement to perform regression and early verification.

{{< alert title="Note" color="info" >}}
OpenShift CI creates thousands of clusters a week - we can certainly afford to run a few more tests. However, we want to
spread that investment to derive the maximum benefit for everyone, so having OpenShift CI run 30 variations of your
exact same tests in slightly different configurations 4 times a day may not be the best way to test.
{{< /alert >}}

### Pre-merge testing

Detecting a regression before it ends up in the release payload at all is the ultimate 
form of release testing. It is the most expensive form because each 
change is tested in isolation. Additionally, due to the scope of OpenShift and it's 
configurations, it is not possible to test everything against every code change.

Repository owners should make an educated selection of the most impactful jobs that 
have a high likelihood of detecting a problem. As the team learns, this list should 
be modified. For example, if a change to the repository causes an incident (see below),
the job that was affected should become a presubmit job on that repository.

We generally recommend you have coverage for both the parallel conformance and
serial suites, as well as an upgrade job.

Typically, jobs which are present on many repositories that span multiple teams
should also be payload blocking.

### Payload blocking

Roughly every six hours, we produce a release payload which is a roll-up of all the 
changes that have merged since the previous one. Each payload runs a set of blocking
CI jobs that must succeed for the payload to be accepted. Our goal is to achieve an
accepted nightly payload every day.

Payload blocking jobs are monitored by the [technical release team](https://docs.ci.openshift.org/docs/release-oversight/the-technical-release-team/),
and regressions to blocking jobs trigger an incident. These jobs _must never break_.
Regressions to these jobs are expected to be detected and reverted within hours. "Fix
forward" is not allowed, the identified change must be reverted and reintroduced with
payload testing confirming the fix.

Due to the disruptive nature of reverts, good candidates are jobs that have wide 
impacts if they break -- core functionality on key platforms of the product, or jobs 
that run as presubmits on a diverse set of repositories.

{{< alert title="Note" color="info" >}}
TRT will typically not see or revert changes that break jobs which are not payload
blocking. For changes which break these jobs, the decision to revert or fix will need
to be handled between the affected team and the team that made the change.
{{< /alert >}}


### Component readiness

[Component Readiness](https://sippy.dptools.openshift.org/sippy-ng/component_readiness/main)
provides a clear dashboard for each release. It compares historical results — the last 
week of the selected release versus the four weeks preceding GA of the previous 
one -- with an automatic fallback to the best a test ever was. For tests without a 
presence in the basis (i.e., new tests), we enforce that new tests work at least 95% of the time.

The goal is simple: ensure each release is as good as or better than the last.

Every test in OpenShift is assigned to a Jira component (e.g. Installer,
kube-apiserver, etc) and every job in OpenShift is assigned variants (Platform, Network,
Topology, etc).  The grid is organized by components on the y-axis, and variants on the
x-axis. Each grid coordinate then either has a red or green square; where red
indicates that at least one test for that component isn't meeting the requirements for
the dashboard.

There are multiple dashboards available in Component Readiness, and new ones can be
created for particular needs. There is always a "X.Y-main" dashboard that is used to
determine a release's readiness to ship.

{{< alert title="Note" color="info" >}}
Regressions detected by component readiness are not candidates for automatic reverts 
by TRT, but may be reverted by the team that made the change.
{{< /alert >}}

## Selecting a path

When considering whether payload blocking or component readiness is right for you, the
primary concerns are detection speed and cost. 

![job-pyramid.png](/job-pyramid.png)
<small style="font-size: 0.5em;">
<a href="https://www.vecteezy.com/free-vector/pyramid-chart">Pyramid Chart Vectors by Vecteezy</a>
</small>

| Use Case            | Detection Speed | Cost | Mechanism                                |
|---------------------|-----------------|------|------------------------------------------|
| Must never regress  | Hours           | $$$$ | Release payload, aggregation             |
| Must never break    | Hours           | $$$  | Release payload, once with retries       |
| Must never regress  | Days            | $$   | Component readiness, frequent periodics  |
| Must never regress  | Weeks           | $    | Component readiness, rarely run          |




### Process for creating a new job

Create [a new multi-stage job](/docs/architecture/step-registry/) on top of latest OCP that
runs as a periodic job. 

Periodic jobs must:

- follow the [naming guidelines](/docs/how-tos/naming-your-ci-jobs/)
- be attached to release branch (release-X.Y) - do not add periodics to your main or 
  master branch unless unavoidable
- kept separate from any presubmits by using the variants feature of ci-operator
- use the release payload provided by CI in the `RELEASE_IMAGE_LATEST` and
`RELEASE_IMAGE_INITIAL` environment variables; do not hard code any particular release
image
- re-use as much of the existing step registry as possible
- include standard `gather` and `gather-extra` steps, or in rare cases custom steps 
  that gather as much of the same data as possible

You should initially run the job on a frequent basis to get a good sample to determine 
it's reliability; at least daily. Frequency can be adjusted later depending 
on the path for release blocking you choose. Job pass rates can be monitored in [Sippy](https://sippy.dptools.openshift.org/sippy-ng/).

Where possible you should be running this same test on PRs to your project’s repos to make sure changes to your project
don’t result in downstream breakages to the release job. We recognize this may not be an option for all projects.

### Becoming Blocking in Component Readiness

For the current development release, update the [component readiness views](https://github.com/openshift/sippy/tree/master/config) to include your job's 
unique variants in the candidate dashboard. If there's no candidate dashboard for that 
release yet, create one (e.g. `4.19-candidate`). You may also create custom dashboards 
as needed, such as those that do cross-variant comparisons.  For new platforms, 
topologies, etc, doing cross-variant comparisons with existing blocking jobs is a good 
strategy to not only ensure your jobs don't regress, but that they are as good as others.

Monitor the dashboard(s) for the duration of the release, and ensure that all squares are 
green prior to that release shipping.  After one release of proving your job is stable 
enough and regressions can be fixed, you may open a PR to include it in the `X.Y-main` 
dashboard for the following release.  This should be done no later than a month after 
branching for the release occurs.

Some jobs may go directly to the `X.Y-main` dashboard. Jobs that are blocking on payloads
or jobs determined by business owners (for example, via their OKR's) are examples of jobs
that may bypass the process.

### Becoming Payload Blocking

Our goal of weekly z-stream releases necessitates that payload blocking jobs provide 
stable and unambiguous signal about regressions in the product or the projects and 
projects on top. To provide this level of stability and observability, any new 
payload blocking jobs must follow the below steps.

Note: these jobs' data also feed into component readiness.

#### Become informing 

After at least one sprint of running the job, and success rate is at least 70%, the job will be considered stable enough
to be considered for inclusion to the nightly informing jobs.

To become an informing job, [file a ticket in the TRT Jira project](https://issues.redhat.com/secure/CreateIssue.jspa?pid=12323832&issuetype=17),
containing:

- The names of the jobs to become informing
- Justification for payload blocking over component readiness
- Links to the job history in [Sippy](https://sippy.dptools.openshift.org/) showing its historical pass rate
- A channel to send Slack alerts, and the threshold to alert on (minimum of 70%)
- A method for escalation of breakages to the team (jira, slack, e-mail, etc)
- A manager backstop to contact if the job fails for a prolonged period

Jobs that fail for an extended period of time without an expectation of return to stability within a reasonable timeframe
(~1 sprint), should be evaluated for removal as an informing job. Jobs that have 
remained informing for 2 releases without going blocking should be removed from 
informing status (but may continue to run as scheduled periodics). 

#### Extract blocking signal

An optional step along the way to become blocking would be to extract partial blocking 
signal from informing jobs using blocking analysis jobs.

We are able to analyze a set of informers matching specific criteria, and ensure that a particular
part of the job passes. We have two of them today, `install-analysis-all` and `overall-analysis-all`. Install analysis
ensures that we get at least one successful install across groups of jobs. For example, we can ensure we get at least one
good install across each platform, each CNI, each IP stack, etc. `overall-analysis-all` ensures that the test step succeeds,
effectively acting as a proxy for "the job passes entirely." For example, we require that techpreview jobs pass all serial
and parallel conformance tests at least once on any platform.


#### Becoming Blocking

After at least 2 sprints of informing status, you may request the job become blocking by again
[filing a ticket in the TRT Jira project](https://issues.redhat.com/secure/CreateIssue.jspa?pid=12323832&issuetype=17).

Blocking jobs come with the responsibility of being responsive to breakages. Generally, TRT expects a team that requests
a blocking job to respond to a breakage within 4 hours during their normal working hours only. In exchange for this agreement,
TRT will monitor the jobs, alert on them, and revert changes in the product that caused the breakage.

#### Once with retries, or aggregated?

There are two options for payload blocking jobs: aggregated, and once with retries.
[_Aggregated jobs_](/docs/release-oversight/improving-ci-signal#job-aggregation-in-a-little-more-detail) give
us _must never regress_ functionality. By running a series of jobs in parallel, we can
do a statistical analysis of the results and not only determine if a test or job is
permanently broken, but if there was a more subtle regression -- i.e. a test dropped from
99% pass rate to 85%. It also allows us to make imperfect jobs blocking.

The alternative, running the job once with an optional amount of retries, allows us to
detect permanent breakages. This is much cheaper than aggregation but lets us make sure
we never permamently break installs, or a particular test. It also requires the job itself
to have an extremely high pass rate.


#### Shortcuts To Becoming Informing or Blocking

Above we request at least 9 weeks from the time a job is created to the time it
could first become blocking. This is to help make sure the job is stable enough
and will not swamp TRT or unreasonably prevent us from getting green payloads.

However, in some scenarios, it may be possible to shortcut this process. We
have recently gained the ability to run specific jobs an arbitrary number of
times via [Gangway](https://github.com/stbenjam/gangway-cli). This allows us to
accumulate more data in a shorter window of time, and see if a job is stable
enough to go blocking. If you feel this is necessary, please get in touch with
TRT and we can try to work out budget concerns and amount of data runs
required.
---
title: "Extending OpenShift Release Gates"
description: An overview of how CI jobs are configured to gate OpenShift releases and how these configurations can be changed.
---

### Overview

Release Gates in OpenShift are used to run conformance tests on variations of the product (upgrades, network type, cloud
platform, etc), run specific test suites to particular core projects, or test layered products. These jobs can either
block promotion of a release payload entirely, or be used to provide signal as an informer.

Blocking jobs are monitored by the [technical release team](https://docs.ci.openshift.org/docs/release-oversight/the-technical-release-team/),
and regressions to blocking jobs trigger an incident, which in the case of breaking code changes, TRT will immediately
revert.

Informing jobs do not block payload promotion directly, but TRT has the ability to extract blocking signal from them.
As an example, we ensure that each platform/cni in our informer list installs the product successfully at least once.
We're also able to ensure a particular test passes at least once across a set of  informing jobs. As an example, we require
that techpreview jobs pass all serial and parallel conformance tests at least once on any platform.

For layered products that extend the control plane of the cluster, they must be able to tie into OpenShift's CI and gate
releases.  For example, OCS is a part of the OpenShift platform, and if an upgrade breaks OCS, we have broken part of our
platform.  Extending our testing to these components is a requirement to perform regression and early verification.

We in general have four types of jobs that control the movement of code to product:

1. PR gating - a set of tests that block PR merges across the entire organization. Each repository may run a different
   set of gating jobs (such as the installer repo testing multiple platforms). Almost every repository will run a
   standard set of consistent tests to prevent regressions (component A breaks component B by changing an API)
2. PR optional - a set of optional tests that can be invoked on PRs as needed by reviewers or testers to gain additional
   coverage, but which running all the time would be inefficient or unnecessary.
3. Release gating - these jobs prevent the publication of a new release payload and are considered the minimum bar of
   quality before any combination of images is created. These tests also catch regressions that PR gates do not. Their
   inclusion is the responsibility of the [technical release team](/docs/release-oversight/the-technical-release-team).
4. Release informing - these jobs provide signal as to the health of a release and test scenarios or particular feature
   sets. Due to the number of possible scenarios, many of these jobs start as periodics, and some are graduated to being
   executed as optional whenever a new release is created (to provide advance warning of key regressions). We call jobs
   triggered on a new release “release-triggered”.

### Identifying Which Jobs Qualify to Gate a Release

A CI job may gate a release once it has reached the following milestones:

1. Useful: is testing a commonly used variation of the product that requires dedicated testing, is testing a project or 
   product that will be widely used on top of OpenShift, or uses OpenShift APIs, or can provide
   useful feedback via automated testing to OpenShift about whether the project continues to work
2. Stable: reached a maturity point where the job is expected to have a stable pattern and is known to
   “work” (components that are prototypes or still iterating towards an “alpha” would not be gates)
3. Testable: is able to create an install or upgrade job that runs a test suite that can verify the project within a
   reasonable time period (1h) with low flakiness (<1% flake rate)

Good candidates include:

* Jobs that verify [upgrade success](/docs/release-oversight/the-technical-release-team/#how-we-do-it)
* Jobs with a high signal-to-noise ratio (high pass rates)
* Products that will ship on top of OpenShift
* Projects or internal tools that depend on OpenShift APIs heavily
* Community projects being evaluated for inclusion into OpenShift or the portfolio

Poor candidates include:

* Jobs with low signal-to-noise ratio (low pass rates)
* Random software from the internet (that may contain vulnerabilities that could be used to attack our CI
  infrastructure)
* Personal projects that use similar APIs and patterns to projects already being tested

{{< alert title="Note" color="info" >}}
OpenShift CI creates thousands of clusters a week - we can certainly afford to run a few more tests. However, we want to
spread that investment to derive the maximum benefit for everyone, so having OpenShift CI run 30 variations of your
exact same tests in slightly different configurations 4 times a day may not be the best way to test.
{{< /alert >}}

### An Introduction to Aggregated Jobs

Creating useful, stable and testable release gating jobs has proven to be difficult at scale. The combinatorial
explosion of cloud providers, layered products and unique configurations means most jobs have a _>1% flake rate_. To "
meet the tests where they are" the Technical Release Team has created a new type of job called the [_aggregated
job_](/docs/release-oversight/improving-ci-signal#job-aggregation-in-a-little-more-detail).

Aggregated Jobs are powerful because they allow a suite of tests to become blocking in spite of a high flake rate. This
is accomplished by analyzing the output from numerous parallel runs to see if payload quality remains as good or better
than the historical mean. If not, the next course of action is to isolate the changes and revert them. This allows other
non-regressing changes to make their way into a release. More importantly it avoids the exponentially difficult task of
debugging multiple regressions in parallel (eg, it's hard to debug a layered product regression on a platform that no
longer installs properly).

### Identifying Which Jobs Should Not Gate a Release

Not all test scenarios and test suites are considered release gating. On a given day we may generate tens of release
payloads, but not choose to execute or iterate the full set of suites on those jobs. Also, some scenarios (such as
upgrade rollback) are intended to generate statistical signal (a given rollback may succeed or fail due to factors
outside the test control). All release informing jobs should start as periodics (as described below) and some may be
promoted to be “release-triggered” jobs.

### Process for Extending the Release Gating Suite

Our goal of weekly z-stream releases necessitates that release-gating tests provide stable and unambiguous signal about
regressions in the product or the projects and projects on top. To provide this level of stability and observability,
any new release-blocking tests must follow the below steps:

#### Add A Periodic Job

Create [a new multi-stage job](/docs/architecture/step-registry/) on top of latest OCP that runs as a periodic job. The
job should reuse as much of the existing step registry as possible, and must include either the standard gather and
gather-extra steps from the step registry, or custom steps (in rare cases) that gather as much of the same data as possible.

This does not block the release but you can run it often enough to get a decent signal. At least once a day, but every 6
or 12 hours is better.

The job name should follow the [naming guidelines](/docs/how-tos/naming-your-ci-jobs/).

Where possible you should be running this same test on PRs to your project’s repos to make sure changes to your project
don’t result in downstream breakages to the release job. We recognize this may not be an option for all projects.

#### Becoming Informing

After at least one sprint of running the job, and success rate is at least 70%, the job will be considered stable enough
to be considered for inclusion to the nightly informing jobs.

To become an informing
job, [file a ticket in the TRT Jira project](https://issues.redhat.com/secure/CreateIssue.jspa?pid=12323832&issuetype=17),
containing:

- The names of the jobs to become informing
- Links to the job history in [Sippy](https://sippy.dptools.openshift.org/) showing its historical pass rate
- A channel to send Slack alerts, and the threshold to alert on (minimum of 70%)
- A method for escalation of breakages to the team (jira, slack, e-mail, etc)
- A manager backstop to contact if the job fails for a prolonged period

Jobs that fail for an extended period of time without an expectation of return to stability within a reasonable timeframe
(~1 sprint), should be evaluated for removal as an informing job.

#### Becoming Blocking

After at least 2 sprints of informing status, you may request the job become blocking by again
[filing a ticket in the TRT Jira project](https://issues.redhat.com/secure/CreateIssue.jspa?pid=12323832&issuetype=17).

Blocking jobs come with the responsibility of being responsive to breakages.  Generally, TRT expects a team that requests
a blocking job to respond to a breakage within 4 hours during their normal working hours only. In exchange for this agreement,
TRT will monitor the jobs, alert on them, and revert changes in the product that caused the breakage.
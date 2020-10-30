---
title: "Extending OpenShift Release Gates"
date: 2020-10-28T11:14:39-04:00
draft: false
---

# Extending OpenShift Release Gates

### Overview
Layered products that extend the control plane of the cluster must be able to tie into OpenShift's CI and gate releases. For example, OCS is a part of the OpenShift platform, and if an upgrade breaks OCS, we have broken part of our platform. Extending our testing to these components is a requirement to perform regression and early verification.

We in general have four types of jobs that control the movement of code to product:

1. PR gating - a set of tests that block PR merges across the entire organization.  Each repository may run a different set of gating jobs (such as the installer repo testing multiple platforms).  Almost every repository will run a standard set of consistent tests to prevent regressions (component A breaks component B by changing an API)
2. PR optional - a set of optional tests that can be invoked on PRs as needed by reviewers or testers to gain additional coverage, but which running all the time would be inefficient or unnecessary.
3. Release gating - these jobs prevent the publication of a new release payload and are considered the minimum bar of quality before any combination of images is created.  These tests also catch regressions that PR gates do not.
4. Release informing - these jobs provide signal as to the health of a release and test scenarios or particular feature sets.  Due to the number of possible scenarios, many of these jobs start as periodics, and some are graduated to being executed as optional whenever a new release is created (to provide advance warning of key regressions).  We call jobs triggered on a new release “release-triggered”.
### Identifying Which Projects Qualify to Gate a Release
A project may gate a release once it has reached the following milestones:

1. Useful: is a project or product that will be widely used on top of OpenShift, or uses OpenShift APIs, or can provide useful feedback via automated testing to OpenShift about whether the project continues to work
2. Stable: reached a maturity point where the product is expected to have a stable install pattern and is known to “work” (components that are prototypes or still iterating towards an “alpha” would not be gates)
3. Testable: is able to create an install and test job in our gating suite that can verify the project within a reasonable time period (1h) with low flakiness (<1% flake rate)

Good candidates include:

* Products that will ship on top of OpenShift
* Projects or internal tools that depend on OpenShift APIs heavily
* Community projects being evaluated for inclusion into OpenShift or the portfolio

Poor candidates include:

* Random software from the internet (that may contain vulnerabilities that could be used to attack our CI infrastructure)
* Personal projects that use similar APIs and patterns to projects already being tested

**Note:** OpenShift CI creates thousands of clusters a week - we can certainly afford to run a few more tests.  However, we want to spread that investment to derive the maximum benefit for everyone, so having OpenShift CI run 30 variations of your exact same tests in slightly different configurations 4 times a day may not be the best way to test.

### Identifying Which Jobs Should Not Gate a Release
Not all test scenarios and test suites are considered release gating.  On a given day we may generate tens of release payloads, but not choose to execute or iterate the full set of suites on those jobs.  Also, some scenarios (such as upgrade rollback) are intended to generate statistical signal (a given rollback may succeed or fail due to factors outside of the test control).  All release informing jobs should start as periodics (as described below) and some may be promoted to be “release-triggered” jobs.

### Process for Extending the Release Gating Suite
Our goal of weekly z-stream releases necessitates that release-gating tests provide stable and unambiguous signal about regressions in the product or the projects and projects on top. To provide this level of stability and observability, any new release-blocking tests must follow the below steps:
#### Add A Periodic, Informative Job
Create a job testing your component on top of latest OCP that runs as a periodic job. This does not block the release but you can run it often enough to get a decent signal.

The job name should follow the pattern `canary-$org-$repo-$name-4.$z` and may run every six to twelve hours. Adding a new job requires adding a raw ProwJob to the [openshift/release]() repository configuration. An example commit doing so is [here](https://github.com/openshift/release/commit/29f2bd54b788c393e9dbf5c90b67334a71ac40b1).

Where possible you should be running this same test on PRs to your project’s repos to make sure changes to your project don’t result in downstream breakages to the release job. We recognize this may not be an option for all projects.
#### Show the Job is Stable
After 20 jobs have run and the success rate is 100%, the job will be considered stable enough to be considered for inclusion to the nightly release blocking suite. Any release blocking test suites must have an extremely low flake rate. As noted in our [Build Cop](https://docs.google.com/document/d/117_0UE5jJI_MyI5ugy1psn0Ls6fWCu-Y9jiZZPM4qzw/edit?ts=5c7d4ca0#heading=h.7i59o09vqwdg) documentation, our targets for all release jobs are 100% success.
#### Finalize the Job Name
In order to make sure the job is reporting on the build cop dashboards so build cops are alerted if it starts failing, rename the job to begin with release- and not canary-, choosing the final name of the suite. This name change will include your job in the release job metrics and dashboards.
#### Add the Job to the Release Gating Suite as Optional
Edit the release controller’s configuration files to add your suite by name, setting optional: true. For example, the 4.2 release gating suites are defined [here](https://github.com/openshift/release/blob/master/ci-operator/infra/openshift/release-controller/releases/release-ocp-4.2.json).
#### Mark new Job as Required in the Release Gating Suite
Once the optional job is running successfully on OCP nightlies for a week, reconfigure your job to be required in the release and assign a release lead to approve the pull request to openshift/release.
#### Sign Up for Build Cop Rotations
Congratulations! Your job is blocking OpenShift nightly releases. The members of your team are now required to sign up to be part of the [Build Cop rotation](https://docs.google.com/document/d/117_0UE5jJI_MyI5ugy1psn0Ls6fWCu-Y9jiZZPM4qzw/edit?ts=5c7d4ca0#). Contact Eric Paris to be included in the schedule. You will have an OpenShift group lead assigned to work with you during your team’s first rotation.

---
title: "Payload Testing"
description: An overview of release controller payload testing.
---

The [Release Controller](https://github.com/openshift/release-controller) ([status page](https://amd64.ocp.releases.ci.openshift.org/)) is responsible for assembling the various OpenShift components into a release payload and initiating broad testing against that payload. If that testing passes, the payload is Accepted, and if not, it is Rejected. (TRT has the ability to manually accept/reject payloads when necessary.)

For cost reasons, we cannot run every possible configuration against pull requests pre-merge. Payload testing, however, batches multiple changes together several times a day and allows us to run extensive testing. This provides an excellent secondary layer to catch regressions that may have merged but have not made it into an accepted payload.

## Payload / Job Organization

The Release Controller maintains payloads for multiple architectures, each of which has its own status page. At present, TRT primarily focuses on [amd64](https://amd64.ocp.releases.ci.openshift.org/).

### CI vs. Nightly Payloads

You will see payloads broken down by OpenShift Release and CI and nightly streams.

CI payloads largely track master branches and are built directly in our CI system.

Nightly payloads are more official as they are built using the full Red Hat build infrastructure. These payloads are candidates for EC/release selection, and thus you will see considerably more testing run. This payload stream is susceptible to outages and delays in the build system. Despite its name, nightly payloads are typically run 2-4 times a day.

### Blocking vs. Informing Jobs

Jobs in the blocking section will reject the payload if they fail. Informing jobs will not. We need to be careful with what goes into blocking for this reason. See [Extending OpenShift Release Gates](https://docs.ci.openshift.org/docs/architecture/release-gating/) for more on how a job can become blocking.

## Aggregated Jobs

Previously, we were very susceptible to flaky tests allowing a problem to make it into the product. A test that was previously passing 100% of the time dropping to 80% of the time is relatively easy to slip through a binary testing process and make it into a formal build of the product.

Aggregated jobs were built to mitigate this by launching *10* jobs of a specific configuration, then checking the pass rate of every test across those 10 runs and comparing it to the historical pass rate over the past few weeks using [Fisher's Exact Test](https://en.wikipedia.org/wiki/Fisher%27s_exact_test). If we see a statistically significant change, the aggregated job will fail. In theory, if every sub-job failed for a different flaky test, the aggregated job could still pass.

This has proven very effective at glazing over the minor flakes that inevitably occur with thousands of tests running against a complex product on unreliable cloud infrastructure and finding the real regressions relatively quickly.

When viewing payload details for a development release, you will typically see several blocking *aggregated* jobs.

Because of its cost, we have to be extremely picky with what jobs get an aggregated variant. Aggregated jobs are disabled when a release reaches GA, replaced by a simple max 3 retries for the job to fully pass.

Two Spyglass panels are present on aggregated jobs in Prow:
  * aggregation-testrun-summary.html: Displays which job runs failed Fisher's Exact for specific tests.
  * job-run-summary: Displays links to each of the 10 sub-jobs, their overall state, and how long they ran for.

## Analysis Jobs

While informing jobs will not cause a payload to be rejected, we wanted a mechanism to extract some signal from them regardless, which would still fail a payload if certain severe conditions were met.

### install-analysis-all

Also known as the Test Case Analyzer, this job checks that at least one job for specific variant combinations passed a particular test a minimum number of times. Today this is used primarily for the install success test, allowing us to ensure at least one job installed regardless of whether subsequent testing fully passed or not (i.e., we ensure at least one AWS tech preview job installed, one vSphere UPI, one AWS single-node, etc.). If any of these variant combinations do NOT have a successful install, this job will fail, and the payload is rejected.

For example, we can make sure there are at least 2 successful installations for all metal UPI jobs for one particular payload run.
In this example, even though none of the metal UPI job runs are blocking, we can still block the overall payload from results of those informing jobs if we did not see enough successful installations.

Let's delve into the details with the command for this:

```
./job-run-aggregator analyze-test-case
  --google-service-account-credential-file=credential.json
  --test-group=install
  --platform=metal
  --network=sdn
  --infrastructure=upi
  --payload-tag=4.11.0-0.nightly-2022-04-28-102605
  --job-start-time=2022-04-28T10:28:48Z
  --minimum-successful-count=2
```
Key Command Arguments:
- `test-group` is a mandatory argument used to match to one or a subset of tests. As of now, only "install" is supported, and it matches to the test "install should succeed: overall" from suite "cluster install".
- `platform` is used to select job variants. Supported values are aws, azure, gcp, libvirt, metal, ovirt, and vsphere.
- `network` is used to select job variants. It chooses between sdn and ovn jobs.
- `infrastructure` is used to select job variants. It is used to choose ipi or upi jobs.
- `payload-tag` is used to select job runs produced by CI or nightly payload runs.
- `job-start-time` is used to narrow down the scope of job runs based on job start time.
- `minimum-successful-count` defines the minimum required passes for install steps among all the candidate job runs.

In a typical use case, `payload-tag` and `job-start-time` are used to scope the job runs to one particular payload run.
Then a combination of different variant arguments (`platform`, `network`, `infrastructure`) can be used to select interesting job runs for analysis.

### overall-analysis-all

This job checks that at least one job for specific variant combinations fully passed.

---
title: "Aggregated Disruption"
description: This section talks about aggregated disruption.
---

There are two types of disruption tests

1.  The first type consists of these 18 tests defined in the [openshift/origin repo](https://github.com/openshift/origin/blob/60a977f08b291f7d6374324778a61440e6704390/pkg/synthetictests/disruption.go#L26):

```html
 [sig-api-machinery] disruption/kube-api connection/new should be available throughout the test
 [sig-api-machinery] disruption/kube-api connection/reused should be available throughout the test
 [sig-api-machinery] disruption/oauth-api connection/new should be available throughout the test
 [sig-api-machinery] disruption/oauth-api connection/reused should be available throughout the test
 [sig-api-machinery] disruption/openshift-api connection/new should be available throughout the test
 [sig-api-machinery] disruption/openshift-api connection/reused should be available throughout the test
 [sig-network-edge] ns/openshift-authentication route/oauth-openshift disruption/ingress-to-oauth-server connection/new should be available throughout the test
 [sig-network-edge] ns/openshift-authentication route/oauth-openshift disruption/ingress-to-oauth-server connection/reused should be available throughout the test
 [sig-network-edge] ns/openshift-console route/console disruption/ingress-to-console connection/new should be available throughout the test
 [sig-network-edge] ns/openshift-console route/console disruption/ingress-to-console connection/reused should be available throughout the test
 [sig-api-machinery] disruption/cache-kube-api connection/new should be available throughout the test
 [sig-api-machinery] disruption/cache-kube-api connection/reused should be available throughout the test
 [sig-api-machinery] disruption/cache-oauth-api connection/new should be available throughout the test
 [sig-api-machinery] disruption/cache-oauth-api connection/reused should be available throughout the test
 [sig-api-machinery] disruption/cache-openshift-api connection/new should be available throughout the test
 [sig-api-machinery] disruption/cache-openshift-api connection/reused should be available throughout the test
 [sig-trt] disruption/ci-cluster-network-liveness connection/new should be available throughout the test
 [sig-trt] disruption/ci-cluster-network-liveness connection/reused should be available throughout the test
```

For these tests, disruption tests are aggregated in a way similar to [how the other junit tests are aggregated](../../improving-ci-signal).

2.  The second type consists of tests that look like these examples below and are defined in [openshift/ci-tools repo](https://github.com/openshift/ci-tools/blob/d540ac734fd1b6bbdc05811c238e362cda2286c1/pkg/jobrunaggregator/jobrunaggregatoranalyzer/analyzer_disruption.go#L57-L64):

```html
 cache-kube-api-new-connections disruption P70 should not be worse
 cache-kube-api-new-connections disruption P85 should not be worse
 cache-openshift-api-new-connections disruption P95 should not be worse
 cache-kube-api-new-connections mean disruption should be less than historical plus five standard deviations
 cache-kube-api-new-connections zero-disruption should not be worse
```

The aggregation is a little more involved for this type. For these tests, we collect disruption numbers
from all job runs, calculate disruption thresholds using the data we collect, then do comparisons with
those disruption thresholds for each job run. The comparisons will result in a status (success or failure)
for each of the job runs. These statuses are then aggregated similar to how the other junit tests are
aggregated.

There are three types of comparisons:

1. **Mean disruption check**: a disruption threshold is calculated as the historical mean plus 5 times the
   standard deviation from historical data (between 10 days ago and 3 days ago) collected from prow jobs
   as described in [Achitecture Data Flow](../data-architecture/).  If the total
   disruption seconds in a prow job exceeds this disruption threshold, a test for that backend fails for that job run.
   Subject to Fisher's Exact Probability Test, a certain number of job runs has to pass to consider the test as passing
   for the aggregated job that the prow job is a part of.
2. **Percentile distribution check**: this is similar to mean disruption check, except, the disruption
   threshold is based on one of three percentiles: P70, P85, and P95.  There is one junit test for P70,
   P85, and P95 for each backend being tested.
3. **Zero disruption check**: this is similar to percentile disribution check except we use the maximum historical
   percentile that has zero seconds of disruption.

The comparisons are run for each of these backends:

1. cache-kube-api (new connections)
2. cache-kube-api (reused connections)
3. cache-oauth-api (new connections)
4. cache-oauth-api (reused connections)
5. cache-openshift-api (new connections)
6. cache-openshift-api (reused connections)
7. kube-api (new connections)
8. kube-api (reused connections)
9. oauth-api (new connections)
10. oauth-api (reused connections)
11. openshift-api (new connections)
12. openshift-api (reused connections)

#### Observing the aggregated disruption results

On the prow spyglass page for an aggregated job, click on "aggregate-testrun-summary.html" and open the accordion.

In this sample output

```html
4. Failed: suite=[BackendDisruption], cache-oauth-api-new-connections disruption P70 should not be worse

   Zero successful runs, we require at least one success to pass (P70=6.00s failures=[1638769365845282816=24s 1638769363324506112=23s
   1638769361634201600=20s 1638769360858255360=33s 1638769359960674304=19s 1638769362481451008=11s 1638769364150784000=7s 1638769364989644800=9s 1638769359117619200=16s])

      1. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769365845282816
      2. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769363324506112
      3. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769361634201600
      4. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769360858255360
      5. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769359960674304
      6. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769362481451008
      7. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769364150784000
      8. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769364989644800
      9. Failure - periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-gcp-ovn-rt-upgrade/1638769359117619200
```

you can see that the `suite=[BackendDisruption], cache-oauth-api-new-connections disruption P70 should not be worse` test failed, the P70 value is 6 seconds
and the prow job IDs follow with the amount of disruption recorded.  This allows you to see how close the underlying jobs came to passing (in the
above example, the values are pretty bad except for one of them which was off by 1 second).

#### Disabling disruption for a specific set of tests

In the past, disruption testing has uncovered some very subtle and difficult to find defects.  In those cases,
it may take several days to find the root cause of the problem.  In a situation like this, it may make sense to
write a bug, mark it as "blocking", and get Accepted payloads flowing again in an effort to avoid blocking development.
In this case, you can temporarily turn off disruption testing for certain aggregated jobs.

To do this, make a modification similar to this code as was done in [this PR](https://github.com/openshift/ci-tools/pull/3317/files):

{{% card-code header="[ci-tools/pkg/jobrunaggregator/jobrunaggregatoranalyzer/analyzer_disruption.go](https://github.com/openshift/ci-tools/blob/01097fb7d27a7477e2f2244f8d94e3b4ba44aad7/pkg/jobrunaggregator/jobrunaggregatoranalyzer/analyzer_disruption.go#L76)" %}}

```go
			// Temporarily skip all azure disruption aggregation due to https://issues.redhat.com/browse/TRT-889
			if strings.Contains(o.jobName, "azure") {
				status = testCaseSkipped
			}
```

{{% /card-code %}}

The idea is to set the resulting `status` of the aggregation to "skipped".  In the example above, the code was added to
skip disruption aggregation for tests where the job has the string "azure" in it.  A similar approach  could
be used to skip disruption for other types of jobs.

{{% alert title="NOTE" color="warning" %}}
Exercise caution when doing this because you are removing a key quality signal (in aggregated jobs) which
means that other disruption related defects could be introduced without you knowing.  Ensure there's a plan to
re-enable the aggregated disruption testing as soon as possible and with the understanding that once you remove it,
you may uncover another defect.
{{% /alert %}}

#### Disabling aggregated disruption

Aggregated disruption tests can be disabled altogether like this:

{{% card-code header="[ci-tools/pkg/jobrunaggregator/jobrunaggregatoranalyzer/analyzer_disruption.go](https://github.com/openshift/ci-tools/blob/01097fb7d27a7477e2f2244f8d94e3b4ba44aad7/pkg/jobrunaggregator/jobrunaggregatoranalyzer/analyzer_disruption.go#L81-L84)" %}}

{{% /card-code %}}

```go
			failedJobRunIDs, successfulJobRunIDs, _, message, err := disruptionCheckFn(ctx, jobRunIDToAvailabilityResultForBackend, backendName)
			...
			// Disable aggregated dirsuption testing.
			status := testCaseSkipped
```

The idea is to set the resulting `status` to "skipped".  The need to disable aggregated disruption should be extremely rare and should be limited to
disabling it for certain tests.
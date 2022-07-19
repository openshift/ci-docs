---
title: "Test Case Analyzer"
description: Introduction of a new tool to analyze test cases across multiple job runs.
---

### Summary
On top of the existing aggregator framework, the new Test Case Analyzer tool is introduced to analyze specific test results from a much broader set of candidate job runs, without requiring the entire job to pass.

### Improvement to CI Payload Signals
CI and nightly payloads run many different jobs. 
Some of those jobs are blocking while the majority are informing. 
Failure of any blocking jobs will reject the payload, but informing job results are not utilized in any automated way to provide valuable CI signals. 
Since the informing job results still carry lots of information about the health of the system, it would be valuable to utilize those results in an automatic way to provide further improvement to the CI Signals.

The Test Case Analyzer was created to expand our ability to block payloads by analyzing test cases from job runs belonging to multiple different jobs, regardless of whether they are informing or blocking. 
The job runs can be selected by certain variants of interest (e.g platform, network, or infrastructure). 
Out of the selected group of job runs, one or a subset of the tests can be analyzed using certain criteria, the job runs themselves do not have to fully pass. 
One example criteria is to have a minimum required number of test successes. 
The end result of the analyzer can be used to form a blocking signal for the overall payload.

This gives us the ability to gate a payload run with information solely from informing jobs. 

### Use Cases

#### Installation Analysis
The initial use case is to analyze installation step across multiple job runs of certain variants. 
Typically, the installation failure of a blocking job is reflected in the job result and therefore is used to block the payload run, but installation failure for informing jobs are never considered for CI signal. 
With the Test Case Analyzer, we can set a minimum required passes for installations for a certain variant. 

For example, we can make sure there are at least 2 successful installations for all metal upi jobs for one particular payload run. 
In this example, even though none of the metal upi job runs are blocking, we can still block the overall payload from results of those informing jobs if we did not see enough successful installations.

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
Key Command Arguments
- test-group is a mandatory argument used to match to one or a subset of tests. As of now, only "install" is supported, and it matches to the test "install should succeed: overall" from suite "cluster install"
- platform is used to select job variants. Supported values are aws, azure, gcp, libvert, metal, overt, and vsphere.
- network is used to select job variants. It chooses between sdn and ovn jobs.
- infrastructure is used to select job variants. It is used to choose ipi or upi jobs.
- payload-tag is used to select job runs produced by CI or nightly payload runs.
- job-start-time is used to narrow down the scope of job runs based on job start time.
- minimum-successful-count defines the minimum required passes for install steps among all the candidate job runs.

In a typical use case, payload-tag and job-start-time are used to scope the job runs to one particular payload run.
Then a combination of different variant arguments (platform, network, infrastructure) can be used to select interesting job runs for analysis.

#### Future Use Cases
The next potential use case is for analysis of upgrade steps. (not yet implemented, but can be easily added with the framework)

### PR Payload
Per PR /payload command was introduced to manually run payload jobs in a PR to make sure important PRs do not potentially introduce product regression. 
It is our intention to support test case analyzer for PR payload jobs.
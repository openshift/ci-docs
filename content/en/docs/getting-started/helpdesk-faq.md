---
title: "Helpdesk FAQ"
description: FAQ from forum-ocp-testplatform on slack
weight: 4
keywords: ["faq", "questions", "help", "common issues", "frequently asked", "answers"]
---

# Frequently Asked Questions

This page contains answers to the most common questions asked in `#forum-ocp-testplatform` on Slack.

## General Questions

### Q: How do I get started with OpenShift CI?
**A:** Start with our [Core Concepts]({{< ref "concepts" >}}) guide, then follow the [Writing Your First Test]({{< ref "writing-first-test" >}}) tutorial. For adding a new repository, see [Onboarding a New Component]({{< ref "../how-tos/onboarding-a-new-component" >}}).

### Q: Where can I find my job logs?
**A:** Click on the job status in your GitHub PR. This will take you to the Prow UI where you can view logs and download artifacts. Logs are kept for 7 days for PR jobs and 30 days for periodic jobs.

### Q: What's the difference between ci-operator and Prow?
**A:** Prow handles GitHub integration and job scheduling, while ci-operator knows how to build and test OpenShift components. Think of Prow as the conductor and ci-operator as the musician. See [Core Concepts]({{< ref "concepts" >}}) for details.

## Job Configuration

### Q: Why isn't my job triggering on PRs?
**A:** Common causes:
1. Job not generated - run `make jobs` in openshift/release
2. Wrong branch configuration - check file naming matches your branch
3. Job is optional - use `/test job-name` to trigger
See [Job Execution Issues]({{< ref "../troubleshooting/job-execution-issues" >}}) for more.

### Q: How do I make my job required/optional?
**A:** Set `optional: true` in your test configuration:
```yaml
tests:
- as: my-test
  optional: true  # Job won't block merge
```

### Q: How do I run tests only when certain files change?
**A:** Use `run_if_changed`:
```yaml
tests:
- as: frontend-tests
  run_if_changed: "^frontend/"  # Regex pattern
```

### Q: What's the default timeout for jobs?
**A:** 4 hours. You can override it:
```yaml
tests:
- as: long-test
  timeout: 6h0m0s
```

## Cluster and Resources

### Q: Why am I getting "no available quota" errors?
**A:** Cloud quota is exhausted. Solutions:
- Wait 1-2 hours for quota to be released
- Use a different cluster profile (aws-2 instead of aws)
- Use cluster pools instead of provisioning new clusters
See [Cluster Problems]({{< ref "../troubleshooting/cluster-problems" >}}).

### Q: How do I test on a specific OpenShift version?
**A:** Configure the `releases` section:
```yaml
releases:
  latest:
    release:
      channel: stable
      version: "4.14"
```

### Q: What cluster profiles are available?
**A:** Common profiles include:
- `aws` - Amazon Web Services
- `gcp` - Google Cloud Platform  
- `azure` - Microsoft Azure
- `vsphere` - VMware vSphere
See [full list](https://github.com/openshift/release/tree/master/ci-operator/step-registry/cluster-profiles).

## Secrets and Access

### Q: How do I add a secret to my CI job?
**A:** 
1. Create secret in Vault at selfservice.vault.ci.openshift.org
2. Add sync metadata:
   - `secretsync/target-namespace: "test-credentials"`
   - `secretsync/target-name: "my-secret"`
3. Wait 30 minutes for sync
See [Adding a New Secret]({{< ref "../how-tos/adding-a-new-secret-to-ci" >}}).

### Q: Why can't I see my job in the Prow UI?
**A:** Check if:
- You're logged in with SSO
- You're a member of the repository's GitHub organization
- The job isn't configured for private deck

### Q: How do I access the cluster created by my test?
**A:** Use the `$KUBECONFIG` environment variable:
```bash
oc --kubeconfig=$KUBECONFIG get nodes
```

## Debugging

### Q: My test is failing, how do I debug it?
**A:** 
1. Check the build log in Prow UI
2. Look at artifacts (must-gather, test logs)
3. Add debug output to your test
4. Use `/retest` to retry
See [Debugging Failed Jobs]({{< ref "../troubleshooting/debugging-failed-jobs" >}}).

### Q: How do I SSH into a running test pod?
**A:** You generally cannot SSH directly. Instead:
- Add a long sleep to your test
- Use `oc debug` while the pod is running
- Save debug information to `${ARTIFACT_DIR}`

### Q: What is "rehearsal" and why is it failing?
**A:** Rehearsals test your CI configuration changes before they're merged. Failures usually mean:
- Breaking changes to existing jobs
- Invalid configuration
- Renaming jobs (breaks TestGrid)
Run `make rehearse` locally to test.

## Common Errors

### Q: "could not resolve release payload"
**A:** Your release configuration is incorrect. Check:
- Release name and version
- Integration namespace configuration
See [Configuration Issues]({{< ref "../troubleshooting/configuration-issues#release-resolution-errors" >}}).

### Q: "unable to import image"
**A:** The base image doesn't exist or isn't accessible. Verify:
- Image name and tag are correct
- Image exists in the specified namespace
- You have permission to access it

### Q: "Process did not finish before 4h0m0s timeout"
**A:** Your test exceeded the time limit. Either:
- Increase the timeout
- Optimize your test
- Split into smaller tests
See [timeout configuration]({{< ref "../troubleshooting/debugging-failed-jobs#timeout-failures" >}}).

## Best Practices

### Q: Should I use container tests or multi-stage tests?
**A:** 
- **Container tests**: Simple commands, unit tests, linting
- **Multi-stage tests**: Need cluster, complex setup, e2e tests

### Q: How often should periodic jobs run?
**A:** Depends on the purpose:
- Critical paths: Every 4-6 hours
- Standard e2e: Daily
- Expensive tests: Weekly
Consider cost and value of the signal.

### Q: Should my job be blocking or informing?
**A:** Start with informing. Only make it blocking after:
- Proven stability (>95% pass rate)
- Critical functionality coverage
- Low false-positive rate
See [Release Gating]({{< ref "../architecture/release-gating" >}}).

## Getting Help

### Q: Where should I ask for help?
**A:** 
1. Check this FAQ and [Troubleshooting Guide]({{< ref "../troubleshooting/_index.md" >}})
2. Search Slack history in `#forum-ocp-testplatform`
3. Use "Ask a Question" workflow in Slack
4. File a Jira ticket for bugs/features

### Q: How do I report a CI outage?
**A:** Use the "Report CI Outage" workflow in `#forum-ocp-testplatform` Slack channel. Include:
- Affected jobs/repos
- Error messages
- When it started
- Impact description

### Q: Who maintains the CI system?
**A:** The Developer Productivity and Test Platform (DPTP) team. Contact via:
- Slack: `#forum-ocp-testplatform`
- Jira: [DPTP project](https://issues.redhat.com/projects/DPTP)

---

## Live FAQ Table

The table below shows recent questions from Slack. Click on a row for details:

{{< rawhtml >}}
<table id="table_helpdesk_faq" class="display" style="width:100%">
    <thead>
        <tr>
            <th></th>
            <th>Topic</th>
            <th>Subject</th>
            <th>Details</th>
            <th>Date</th>
            <th>Link</th>
        </tr>
    </thead>
</table>
{{< /rawhtml >}}

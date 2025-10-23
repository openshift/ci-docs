---
title: "Job Execution Issues"
description: Troubleshooting jobs that won't start, trigger, or schedule
weight: 1
---

# Job Execution Issues

This guide helps you resolve issues when CI jobs won't start, don't trigger when expected, or stay in pending state.

## Quick Diagnosis

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Job doesn't appear on PR | Not configured correctly | [Job Not Triggering](#job-not-triggering) |
| Job stays "Pending" | Resource constraints | [Job Stuck Pending](#job-stuck-pending) |
| "Unknown job" error | Job name mismatch | [Unknown Job](#unknown-job-error) |
| Job runs unexpectedly | Trigger conditions | [Unexpected Execution](#unexpected-job-execution) |

## Job Not Triggering

### Problem: Job Doesn't Appear on PR

**Symptoms**:
- No job status shown on GitHub PR
- `/test` command returns "unknown job"

**Common causes**:

1. **Job not generated**:
   ```bash
   # In openshift/release repo
   make jobs
   git status  # Check for uncommitted changes
   ```

2. **Wrong branch configuration**:
   ```yaml
   # Check file naming
   ci-operator/config/org/repo/org-repo-main.yaml  # For main branch
   ci-operator/config/org/repo/org-repo-release-4.15.yaml  # For release branch
   ```

3. **Job is optional**:
   ```yaml
   tests:
   - as: optional-test
     optional: true  # Won't run automatically
     # ...
   ```
   - Optional jobs must be triggered manually with `/test optional-test`

### Problem: Conditional Jobs Not Running

**Symptoms**:
- Job configured with `run_if_changed` doesn't trigger
- Expected job doesn't run on certain PRs

**Solutions**:

1. **Verify path patterns**:
   ```yaml
   tests:
   - as: frontend-tests
     run_if_changed: "^frontend/"  # Only runs if frontend/ files change
   ```

2. **Check skip conditions**:
   ```yaml
   tests:
   - as: backend-tests
     skip_if_only_changed: "^docs/"  # Skips if only docs change
   ```

3. **Debug with test command**:
   ```bash
   # Force run regardless of conditions
   /test frontend-tests
   ```

### Problem: Periodic Jobs Not Running

**Symptoms**:
- Cron job doesn't execute on schedule
- Periodic job never triggers

**Common issues**:

1. **Invalid cron syntax**:
   ```yaml
   tests:
   - as: nightly
     cron: "0 0 * * *"  # Runs at midnight UTC
     # Common mistake: using 6 fields instead of 5
   ```

2. **Missing interval/cron**:
   ```yaml
   tests:
   - as: periodic-test
     interval: 24h  # OR use cron, not both
   ```

## Job Stuck Pending

### Problem: Job Stays in Pending State

**Common causes and solutions**:

1. **Cluster capacity**:
   - Check [cluster status](https://prow.ci.openshift.org/)
   - Look for banner messages about capacity issues
   - Wait and retry later

2. **Resource requests too high**:
   ```yaml
   # Reduce resource requests
   resources:
     requests:
       cpu: 500m     # Instead of 4
       memory: 2Gi   # Instead of 16Gi
   ```

3. **Specific node requirements**:
   ```yaml
   # Remove unnecessary node selectors
   nodeSelector:
     node-role.kubernetes.io/tests: ""  # May limit scheduling
   ```

### Problem: "Could not schedule pod"

**Error**:
```
0/10 nodes are available: insufficient cpu
```

**Solutions**:

1. **Check current cluster load**:
   - Visit Grafana dashboards
   - Look for cluster utilization

2. **Use a different cluster**:
   ```yaml
   # In .ci-operator.yaml
   cluster: build01  # Try different cluster
   ```

3. **Reduce parallelism**:
   ```yaml
   # Limit concurrent test pods
   tests:
   - as: parallel-tests
     steps:
       test:
       - as: tests
         parallelism: 5  # Reduce from default
   ```

## Unknown Job Error

### Problem: "/test job-name" Returns Unknown

**Error**:
```
@user: The following jobs are not known to prow: job-name
```

**Debugging steps**:

1. **Verify exact job name**:
   ```yaml
   # In ci-operator config
   tests:
   - as: e2e-aws  # This is the exact name to use
   ```
   - Use: `/test e2e-aws`
   - Not: `/test e2e-aws-test` or `/test test-e2e-aws`

2. **Check job generation**:
   ```bash
   # Jobs must be generated
   cd openshift/release
   make jobs
   
   # Verify job exists
   grep -r "name: pull-ci-org-repo-.*-e2e-aws" ci-operator/jobs/
   ```

3. **Ensure PR is updated**:
   ```bash
   # Rebase your PR
   git rebase upstream/master
   git push --force
   ```

## Unexpected Job Execution

### Problem: Job Runs When It Shouldn't

**Symptoms**:
- Job triggers on unrelated changes
- Periodic job runs too frequently

**Common causes**:

1. **Missing `run_if_changed`**:
   ```yaml
   tests:
   - as: expensive-test
     # Add condition to limit runs
     run_if_changed: "^(cmd|pkg)/"
   ```

2. **Always run is default**:
   ```yaml
   tests:
   - as: selective-test
     always_run: false  # Must explicitly set to false
     run_if_changed: "^specific-path/"
   ```

## Rehearsal Jobs

### Problem: Rehearsal Jobs Failing

**Symptoms**:
- `ci/prow/rehearse` jobs fail
- Changes to ci-operator config blocked

**Solutions**:

1. **Check rehearsal output**:
   - Click on failed rehearsal job
   - Look for specific errors
   - Often indicates breaking changes

2. **Common rehearsal failures**:
   - Renaming jobs (breaks TestGrid)
   - Removing required jobs
   - Invalid configuration

3. **Test locally**:
   ```bash
   # Run rehearsals locally
   make rehearse
   ```

## Job Scheduling Issues

### Problem: Jobs Not Running in Order

**Symptoms**:
- Post jobs run before tests complete
- Dependencies not respected

**Solutions**:

1. **Use run_after_success**:
   ```yaml
   - as: publish
     postsubmit: true
     run_after_success:
     - e2e-tests
     - unit-tests
   ```

2. **Chain dependencies correctly**:
   ```yaml
   chain:
     as: sequential-tests
     steps:
     - ref: first-test    # Runs first
     - ref: second-test   # Runs after first
   ```

## Debugging Tools

### View Job Configuration

```bash
# See generated job config
ci-operator-configresolver -config ci-operator/config/org/repo/config.yaml -print-config

# Validate job config
ci-operator-checkconfig -config ci-operator/config/org/repo/config.yaml
```

### Check Prow Status

1. **Prow dashboard**: https://prow.ci.openshift.org/
2. **PR history**: https://prow.ci.openshift.org/pr-history
3. **Job history**: https://prow.ci.openshift.org/job-history

### Force Job Execution

```bash
# Trigger specific job
/test job-name

# Trigger all jobs
/retest

# Skip specific jobs
/test all skip-job-name
```

## Prevention

### Best Practices

1. **Test configuration locally**:
   ```bash
   make validate-config
   make jobs
   ```

2. **Use descriptive job names**:
   ```yaml
   tests:
   - as: e2e-aws-sdn  # Clear what it tests
   ```

3. **Set appropriate triggers**:
   ```yaml
   tests:
   - as: expensive-test
     optional: true  # Don't run on every PR
   ```

4. **Document special requirements**:
   ```yaml
   tests:
   - as: special-test
     # This test requires manual trigger due to X
     optional: true
   ```

## Getting Help

If jobs still won't execute:

1. **Verify basics**:
   - Job name matches exactly
   - Configuration is valid
   - Jobs are generated

2. **Check Prow status**:
   - Look for outage banners
   - Check Slack announcements

3. **Ask for help**:
   - Include PR link
   - Show `/test` commands tried
   - Share job configuration

## Next Steps

- [Debugging Failed Jobs]({{< ref "debugging-failed-jobs" >}}) - When jobs run but fail
- [Configuration Issues]({{< ref "configuration-issues" >}}) - For config problems
- [Cluster Problems]({{< ref "cluster-problems" >}}) - For infrastructure issues 
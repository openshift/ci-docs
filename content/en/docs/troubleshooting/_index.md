---
title: "Troubleshooting Guide"
linkTitle: "Troubleshooting"
weight: 3
description: >
  Common issues and how to debug CI problems
---

# Troubleshooting OpenShift CI

This guide helps you diagnose and fix common issues with OpenShift CI jobs. Based on real questions from the community, it covers the most frequent problems and their solutions.

## Quick Diagnosis

Start here to identify your issue:

### My Job Won't Start
- **Symptom**: Job stays pending or doesn't trigger
- **Go to**: [Job Execution Issues]({{< ref "job-execution-issues" >}})

### My Job Fails
- **Symptom**: Job runs but exits with error
- **Go to**: [Debugging Failed Jobs]({{< ref "debugging-failed-jobs" >}})

### Cluster Issues
- **Symptom**: Can't create cluster, cluster fails to install
- **Go to**: [Cluster Problems]({{< ref "cluster-problems" >}})

### Configuration Errors
- **Symptom**: Invalid YAML, rehearsal failures
- **Go to**: [Configuration Issues]({{< ref "configuration-issues" >}})

### Access and Permissions
- **Symptom**: Can't access resources, permission denied
- **Go to**: [Access Issues]({{< ref "access-issues" >}})

## Common Error Messages

Quick solutions for frequently seen errors:

| Error | Solution |
|-------|----------|
| `error creating cluster: no available quota` | Check [quota limits]({{< ref "cluster-problems#quota-issues" >}}) |
| `failed to resolve release` | See [release resolution]({{< ref "configuration-issues#release-errors" >}}) |
| `permission denied` | Review [RBAC setup]({{< ref "access-issues#rbac" >}}) |
| `timeout waiting for pod` | Check [timeout configuration]({{< ref "debugging-failed-jobs#timeouts" >}}) |
| `unable to find secret` | Verify [secret setup]({{< ref "access-issues#secrets" >}}) |

## General Debugging Steps

For any CI issue, follow these steps:

### 1. Check the Prow UI
- Navigate to your PR on GitHub
- Click on the failed job status
- Look for error messages in the job log

### 2. Review Artifacts
Most jobs save debugging information:
```
artifacts/
├── build-log.txt         # Main job output
├── e2e/                  # Test logs
├── junit/                # Test results
└── must-gather/          # Cluster diagnostic data
```

### 3. Check Recent Changes
- Did your PR modify CI configuration?
- Were there recent changes to base images?
- Is this a new failure or recurring issue?

### 4. Use Debug Commands
Add debugging to your test:
```bash
# Print environment
env | grep -E "(CLUSTER|KUBE|OPENSHIFT)" | sort

# Check cluster status
oc get nodes
oc get clusterversion
oc get clusteroperators

# Save debug info
oc adm must-gather --dest-dir=${ARTIFACT_DIR}/must-gather
```

## Getting Help

If you can't resolve your issue:

1. **Search First**
   - Check this troubleshooting guide
   - Search Slack history in `#forum-ocp-testplatform`
   - Look for similar issues in [Jira](https://issues.redhat.com/projects/DPTP)

2. **Gather Information**
   - Job URL
   - Error messages
   - What you've already tried
   - Relevant configuration snippets

3. **Ask for Help**
   - Use the "Ask a Question" workflow in `#forum-ocp-testplatform`
   - Include all gathered information
   - Be specific about what you're trying to achieve

## Preventing Issues

Best practices to avoid common problems:

- **Test locally first**: Validate YAML and scripts before pushing
- **Start simple**: Begin with basic tests, add complexity gradually
- **Use existing patterns**: Copy from working examples
- **Monitor your jobs**: Set up alerts for failures
- **Keep configurations DRY**: Use the step registry for reusable components

## Next Steps

- [Job Execution Issues]({{< ref "job-execution-issues" >}}) - Jobs that won't start
- [Debugging Failed Jobs]({{< ref "debugging-failed-jobs" >}}) - Jobs that fail
- [Cluster Problems]({{< ref "cluster-problems" >}}) - Cluster creation/access issues
- [Configuration Issues]({{< ref "configuration-issues" >}}) - YAML and setup problems
- [Access Issues]({{< ref "access-issues" >}}) - Permissions and secrets 
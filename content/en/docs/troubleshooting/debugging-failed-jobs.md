---
title: "Debugging Failed Jobs"
description: How to investigate and fix CI job failures
weight: 2
keywords: ["troubleshooting", "debug", "errors", "problems", "issues", "help", "debugging", "fix"]
aliases:
  - /docs/debug/
  - /docs/fix-jobs/
  - /docs/job-failures/
---

# Debugging Failed Jobs

This guide helps you investigate why a CI job failed and how to fix it.

## Quick Checklist

When a job fails, check these in order:

1. **Build Log** - Did the job start correctly?
2. **Test Output** - What specific test failed?
3. **Artifacts** - Are there error logs or must-gather data?
4. **Infrastructure** - Was there a cluster or network issue?
5. **Recent Changes** - What changed since it last worked?

## Common Failure Types

### Test Failures

**Symptom**: Job runs but tests fail
```
FAIL: TestMyFeature (10.23s)
    myfeature_test.go:42: expected X but got Y
```

**Solutions**:
- Review the test output in artifacts
- Check if the test is flaky (fails intermittently)
- Verify test assumptions are correct
- Run the test locally to reproduce

### Build Failures

**Symptom**: Compilation or image build errors
```
error: build error: unable to build image
```

**Solutions**:
- Check for syntax errors in code
- Verify base image availability
- Ensure all dependencies are specified
- Review Dockerfile for issues

### Timeout Failures

**Symptom**: Job killed after time limit
```
error: Process did not finish before 4h0m0s timeout
```

**Solutions**:
- Increase timeout in job configuration:
  ```yaml
  tests:
  - as: slow-test
    timeout: 6h0m0s  # Increase from default 4h
    steps:
      # ...
  ```
- Optimize test execution
- Split into multiple smaller jobs
- Check for hanging processes

### Resource Failures

**Symptom**: Out of memory or CPU
```
Container exceeded memory limit
```

**Solutions**:
- Increase resource requests:
  ```yaml
  tests:
  - as: memory-intensive
    steps:
      test:
      - as: test
        resources:
          requests:
            cpu: 2
            memory: 8Gi
          limits:
            memory: 10Gi
  ```
- Optimize resource usage
- Check for memory leaks

## Debugging Techniques

### 1. Add Debug Output

Enhance your test with debugging information:

```bash
#!/bin/bash
set -euxo pipefail  # Print commands as they execute

# Save environment for debugging
env | sort > ${ARTIFACT_DIR}/environment.txt

# Add timing information
date > ${ARTIFACT_DIR}/test-start.txt

# Your test commands here
make test || {
    echo "Test failed, gathering debug info..."
    
    # Capture system state
    df -h > ${ARTIFACT_DIR}/disk-usage.txt
    ps aux > ${ARTIFACT_DIR}/processes.txt
    
    # If using a cluster
    oc get nodes -o wide > ${ARTIFACT_DIR}/nodes.txt
    oc get pods --all-namespaces > ${ARTIFACT_DIR}/pods.txt
    
    exit 1
}

date > ${ARTIFACT_DIR}/test-end.txt
```

### 2. Use Test Artifacts

Always save important files:

```bash
# Save test results
go test -v ./... 2>&1 | tee ${ARTIFACT_DIR}/test-output.txt

# Save coverage
go test -coverprofile=${ARTIFACT_DIR}/coverage.out ./...

# Save any generated files
cp -r generated/ ${ARTIFACT_DIR}/

# For multi-stage tests, use SHARED_DIR
echo "important-value" > ${SHARED_DIR}/my-data.txt
```

### 3. Interactive Debugging

For complex issues, use interactive debugging:

1. **SSH into the test pod** (if still running):
   ```bash
   oc debug pod/<pod-name> -n <namespace>
   ```

2. **Run a debug container**:
   ```yaml
   tests:
   - as: debug-env
     commands: |
       # Keep pod running for debugging
       echo "Debugging environment ready"
       sleep 3600  # Keep alive for 1 hour
     container:
       from: src
   ```

### 4. Check Infrastructure Issues

Sometimes failures are infrastructure-related:

```bash
# Check cluster health
oc get clusteroperators
oc get nodes
oc describe node <node-name>

# Check pod events
oc get events --sort-by='.lastTimestamp'

# Check resource usage
oc adm top nodes
oc adm top pods
```

## Analyzing Specific Errors

### "No such file or directory"

**Common causes**:
- File not included in image
- Wrong working directory
- Path typo

**Debug**:
```bash
# List files to verify
ls -la
find . -name "expected-file"
pwd
```

### "Connection refused" or "Network timeout"

**Common causes**:
- Service not ready
- Firewall/network policy
- Wrong endpoint

**Debug**:
```bash
# Check service availability
curl -v http://service:port/health
netstat -an | grep LISTEN
oc get svc
oc get endpoints
```

### "Image pull errors"

**Common causes**:
- Image doesn't exist
- Registry authentication failed
- Network issues

**Debug**:
```bash
# Check image availability
skopeo inspect docker://registry.example.com/image:tag

# Verify pull secret
oc get secret pull-secret -o yaml
```

## Working with Flaky Tests

If a test fails intermittently:

1. **Check historical pass rate**:
   - Look at TestGrid for patterns
   - Review recent PR results

2. **Add retries for known flakes**:
   ```go
   func TestFlakyFeature(t *testing.T) {
       for i := 0; i < 3; i++ {
           err := tryTest()
           if err == nil {
               return
           }
           t.Logf("Attempt %d failed: %v", i+1, err)
           time.Sleep(time.Second * 10)
       }
       t.Fatal("Test failed after 3 attempts")
   }
   ```

3. **Report persistent flakes**:
   - File a Jira issue
   - Consider marking test as `optional: true`

## Getting Help

If you're still stuck:

1. **Collect all relevant information**:
   - Job URL
   - Error messages
   - What you've tried
   - Recent changes

2. **Ask in Slack**:
   - `#forum-ocp-testplatform` for CI issues
   - Component-specific channels for test failures

3. **File an issue**:
   - Use Slack workflows to create Jira tickets
   - Include reproduction steps

## Next Steps

- [Job Execution Issues]({{< ref "job-execution-issues" >}}) - If your job won't start
- [Configuration Issues]({{< ref "configuration-issues" >}}) - For YAML and setup problems
- [Cluster Problems]({{< ref "cluster-problems" >}}) - For cluster-specific failures 
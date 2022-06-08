---
title: "Testing Backends For Availability"
description: This is an overview for how backends are queried for their availability status.
---

### Overview Diagram

This diagram shows how backends are queried to determine their availability:

![Query Backends1](/query_backends1.png)


* (1) Starting from a call to
  [StartAllAPIMonitoring](https://github.com/openshift/origin/blob/08eb7795276c45f2be16e980a9687e34f6d2c8ec/test/extended/util/disruption/controlplane/known_backends.go#L13),
  one of several BackendSamplers are created:

{{% card-code header="[origin/test/extended/util/disruption/controlplane/known_backends.go](https://github.com/openshift/origin/blob/08eb7795276c45f2be16e980a9687e34f6d2c8ec/test/extended/util/disruption/controlplane/known_backends.go#L54)" %}}

```go
	backendSampler, err := createKubeAPIMonitoringWithNewConnections(clusterConfig)
```

{{% /card-code %}}

* (2) Then a disruptionSampler is created with that BackendSampler
  https://github.com/openshift/origin/blob/08eb7795276c45f2be16e980a9687e34f6d2c8ec/pkg/monitor/backenddisruption/disruption_backend_sampler.go#L410

{{% card-code header="[origin/pkg/monitor/backenddisruption/backenddisruption/disruption_backend_sampler.go](https://github.com/openshift/origin/blob/08eb7795276c45f2be16e980a9687e34f6d2c8ec/pkg/monitor/backenddisruption/disruption_backend_sampler.go#L410)" %}}

```go
	disruptionSampler := newDisruptionSampler(b)
    go disruptionSampler.produceSamples(producerContext, interval)
	go disruptionSampler.consumeSamples(consumerContext, interval, monitorRecorder, eventRecorder)
```

{{% /card-code %}}

* (3) The `produceSamples` function is called to produce the disruptionSamples.  This function is built around
  a [`Ticker`](https://go.dev/src/time/tick.go) that fires every 1 second.  The `checkConnection` function is
  called to send an Http GET to the backend and look for a response from the backend.

{{% card-code header="[origin/pkg/monitor/backenddisruption/disruption_backend_sampler.go](https://github.com/openshift/origin/blob/08eb7795276c45f2be16e980a9687e34f6d2c8ec/pkg/monitor/backenddisruption/disruption_backend_sampler.go#L506)" %}}


```go
    func (b *disruptionSampler) produceSamples(ctx context.Context, interval time.Duration) {
    	ticker := time.NewTicker(interval)
    	defer ticker.Stop()
    	for {
    		// the sampleFn may take a significant period of time to run.  In such a case, we want our start interval
    		// for when a failure started to be the time when the request was first made, not the time when the call
    		// returned.  Imagine a timeout set on a DNS lookup of 30s: when the GET finally fails and returns, the outage
    		// was actually 30s before.
    		currDisruptionSample := b.newSample(ctx)
    		go func() {
    			sampleErr := b.backendSampler.checkConnection(ctx)
    			currDisruptionSample.setSampleError(sampleErr)
    			close(currDisruptionSample.finished)
    		}()

    		select {
    		case <-ticker.C:
    		case <-ctx.Done():
      			return
    		}
    	}
    }
```

{{% /card-code %}}

* (4) The `checkConnection` function, produces `disruptionSamples` which represent the startTime of the Http GET and
   an associated `sampleErr` that trackes if the Http GET was successful (sampleErr set to `nil`) or failing (the error
   is saved).  The `disruptionSamples` are stored in a slice referenced by the `disruptionSampler`.

* (5) The `consumeSamples` function takes the disruptionSamples and determines when disruption started and stopped.  It
  then records Events and records Intervals/Conditions on the monitorRecorder.


{{% card-code header="[origin/pkg/monitor/backenddisruption/disruption_backend_sampler.go](https://github.com/openshift/origin//blob/master/pkg/monitor/backenddisruption/disruption_backend_sampler.go#L504)" %}}

```go
    func (b *disruptionSampler) consumeSamples(ctx context.Context, interval time.Duration, monitorRecorder Recorder, eventRecorder events.EventRecorder) {
```

{{% /card-code %}}

* (6) Intervals on the monitorRecorder are used by the synthetic tests.
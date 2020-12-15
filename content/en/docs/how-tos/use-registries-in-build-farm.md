---
title: "Use Registries in Build Farm"
date: 2020-12-15T16:08:01-04:00
draft: false
---

The follow table shows the public DNS of each registry in build farm:

| cluster | registry                                             | note                        |
|---------|------------------------------------------------------|-----------------------------|
| api.ci  | registry.svc.ci.openshift.org                        |                             |
| app.ci  | registry.ci.openshift.org                            | the central CI registry     |
| build01 | registry.build01.ci.openshift.org                    |                             |
| build02 | registry.build02.ci.openshift.org                    |                             |
| vsphere | registry.apps.build01-us-west-2.vmc.ci.openshift.org | only open to vsphere admins |

# Login as a github user:

* Ensure oc-cli has logged into the cluster: Copy the login command from [the console](/docs/getting-started/useful-links/#clusters).
* Use oc token to log into the registry, e.g.,  `registry.ci.openshift.org`:

```bash
$ docker login -u $(oc whoami) -p $(oc whoami -t) registry.ci.openshift.org
Login Succeeded!

$ cat ${HOME}/.docker/config.json
{
	"auths": {
		"registry.ci.openshift.org": {
			"auth": "token"
		}
	}
}
```

# Get token for a service account

If some robot is required to log into the central CI registry, we need to use a service account: Choose a new namespace, and create a pull request to add a folder with the same name in [release/clusters/app.ci](https://github.com/openshift/release/tree/master/clusters/app.ci). The folder should contain the namespace manifest.

After the pull request is merged, the manifests in the folder will be applied automatically to `app.ci`. We can use `sa/builder` which [Openshift creates by default for any namespace and is allowed to pull images from any imagestream in the namespace](https://docs.openshift.com/container-platform/4.6/authentication/using-service-accounts-in-applications.html#default-service-accounts-and-roles_using-service-accounts). [Openshift also creates secrets for each service account for the OpenShift Container Registry](https://docs.openshift.com/container-platform/4.6/authentication/using-service-accounts-in-applications.html#service-accounts-overview_using-service-accounts). The secret name could be found at `sa.imagePullSecrets`.

We can then get the token of, e.g., `SA/builder` in `namespace/ci`:

```bash
$ namespace=ci
$ sa=builder
$ secret=$(oc get sa -n $namespace $sa -o json | jq -r '.imagePullSecrets[0].name')
$ hostname=image-registry.openshift-image-registry.svc:5000
$ oc get secret --namespace $namespace $secret -o json | jq '.data[".dockercfg"]' --raw-output | base64 --decode | jq --arg h $hostname 'with_entries(select(.key==$h))'
{
  "image-registry.openshift-image-registry.svc:5000": {
    "auth": "token"
  }
}
```

The token can be used to modify the `${HOME}/.docker/config.json` file above.

# Access Images built during a testrun

The URL of an image is `<registry_dns>/<namespace>/<imagestream>:<tag>`.

Determine which cluster the job is running on, e.g. the follow line in the job log says that the job runs on `build02` and that `ci-op-2c2tvgti` is the temporary namespace for the test:

```
2020/11/20 14:12:28 Using namespace https://console.build02.ci.openshift.org/k8s/cluster/projects/ci-op-2c2tvgti
```

E.g., the image `pipeline:odh-manifests-tests` in `ci-op-2c2tvgti` can be pulled by

```bash
$ docker pull registry.build02.ci.openshift.org/ci-op-2c2tvgti/pipeline:odh-manifests-tests
```

Note that the only github user that has access to the image is the author of the underlying pull request which triggers the testrun.

# Access the promoted images

If `ci-operator`'s config has [`promotion` stanza](/docs/architecture/ci-operator/#publishing-container-images), the images are published to the central CI registry at `app.ci`.

```yaml
images:
- dockerfile_path: images/hello-openshift/Dockerfile.rhel
  from: base
  inputs:
    ocp_builder_rhel-8-golang-1.15-openshift-4.7:
      as:
      - registry.svc.ci.openshift.org/ocp/builder:rhel-8-golang-1.15-openshift-4.7
  to: hello-openshift
promotion:
  name: "4.7"
  namespace: ocp
```

We can pull the image defined by above `promotion` stanza by:

```bash
$ docker pull registry.ci.openshift.org/ocp/4.7:hello-openshift
```

# Troubleshooting

## I am getting an "authentication required" error, why?

```bash
$ docker pull registry.svc.ci.openshift.org/ci/applyconfig:latest
Trying to pull registry.svc.ci.openshift.org/ci/applyconfig:latest...
  unable to retrieve auth token: invalid username/password: unauthorized: authentication required
Error: unable to pull registry.svc.ci.openshift.org/ci/applyconfig:latest: Error initializing source docker://registry.svc.ci.openshift.org/ci/applyconfig:latest: unable to retrieve auth token: invalid username/password: unauthorized: authentication required
```

You most likely logged in at some point and your token expired, this now prevents all pulls from that registry, even for public images.

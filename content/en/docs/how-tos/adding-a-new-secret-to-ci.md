---
title: "Adding a New Secret to CI"
date: 2020-12-21T10:08:01-04:00
draft: false
---

Choose a new namespace, and create a pull request to add a folder with the same name in [release/core-services](https://github.com/openshift/release/tree/master/core-services). The folder should contain the manifests for the namespace and the RBACs regarding to the namespace. If the desired namespace exists already, ask the owners of the namespace if it can be shared. After the pull request is merged, the manifests in the folder will be applied automatically to `api.ci`.

Log into `api.ci` and create the secret in the namespace chosen above.

Use the secret as the source in [the mapping file](https://github.com/openshift/release/tree/master/core-services/secret-mirroring).
The secret and any modification on it afterwards will be populated to the targeting namespace on [all clusters](/docs/getting-started/useful-links/#clusters) in the build farm.

#!/bin/bash

set -euo pipefail

getRegex() {
  echo -n "s/\b(?<![\`#])$1\b/\`$1\`/g"
}

for toEscape in ci-operator base_images build_root image_stream_tag ImageStream ImageStreamTag base_images git Dockerfile .ci-operator.yaml ImageStreamTags Namespace test_binary_build_commands binary_build_commands FROM Builds promotion tag_specification altest Pod true false presubmit postsubmit images src bin boskos min-count max-count cluster_profile OWNERS make ConfigMap config_updater; do
  find content -name "*.md" -exec  perl -pi -e $(getRegex $toEscape) {} \;
 done

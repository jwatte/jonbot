#!/bin/bash
set -e
set -x
npm run build
(cd dist && tar cfz /tmp/jonbot.tgz .)
KD="kubectl --context gke_dev-infra-422317_us-west1-b_dev-infra"
pods=$($KD get pod -n jonbot --template '{{range .items}}{{.metadata.name}}{{"\n"}}{{end}}')
for pod in $pods; do
	$KD cp -n jonbot /tmp/jonbot.tgz $pod:/jonbot/jonbot.tgz
done
$KD exec -t -n jonbot deployment/jonbot -- tar xf jonbot.tgz
$KD exec -t -n jonbot deployment/jonbot -- date "+%Y-%m-%dT%H:%M:%S%Z boop.sh" > date.txt
# nuke it -- the Dockerfile will restart it. Also, the PID is deterministic, but magic.
$KD exec -t -n jonbot deployment/jonbot -- kill -9 9
$KD logs -n jonbot deployment/jonbot --follow

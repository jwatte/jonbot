#!/bin/bash
set -e
npm run build
(cd dist && tar cfz /tmp/jonbot.tgz .)
KD="kubectl --context gke_dev-infra-422317_us-west1_dev-infra-2"
pods=$($KD get pod -n jonbot --template '{{range .items}}{{.metadata.name}}{{"\n"}}{{end}}')
for pod in $pods; do
	$KD cp -n jonbot /tmp/jonbot.tgz $pod:/jonbot/jonbot.tgz
	$KD exec -t -n jonbot $pod -- tar xf jonbot.tgz
	$KD exec -t -n jonbot $pod -- bash -c 'date "+%Y-%m-%dT%H:%M:%S%Z boop.sh" > date.txt'
	# nuke it -- the Dockerfile will restart it. Also, the PID is deterministic, but magic.
	$KD exec -t -n jonbot $pod -- bash -c "kill \$(ps alx | grep [n]ode | awk '{ print \$3 }')"
done
$KD logs -n jonbot statefulset/jonbot --follow --tail 30

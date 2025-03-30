#!/usr/bin/env bash
KD="kubectl --context gke_dev-infra-422317_us-west1_dev-infra-2"
$KD logs -n jonbot statefulset/jonbot --follow --tail 30

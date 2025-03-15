#!/usr/bin/env bash
KD="kubectl --context gke_dev-infra-422317_us-west1-b_dev-infra"
$KD logs -n jonbot statefulset/jonbot --follow

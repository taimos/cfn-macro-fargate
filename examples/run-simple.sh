#!/usr/bin/env bash

export AWS_DEFAULT_REGION=eu-central-1
export AWS_REGION=eu-central-1

set -e

aws cloudformation deploy --template-file simple.yaml --stack-name cfn-macro-fargate-simple --parameter-overrides Count=2 --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset
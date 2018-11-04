#!/usr/bin/env bash

export AWS_DEFAULT_REGION=eu-central-1
export AWS_REGION=eu-central-1

set -e

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
SAM_BUCKET=${ACCOUNT_ID}-sam-deploy-${AWS_REGION}
STACK_NAME=cfn-macro-fargate

if ! aws s3api head-bucket --bucket "${SAM_BUCKET}" 2>/dev/null; then
 echo "Please create S3 bucket \"${SAM_BUCKET}\" as deployment bucket"
 echo "This bucket can be reused for all your SAM deployments"
 echo ""
 echo "aws s3 mb s3://${SAM_BUCKET}"
 exit 1
fi

cd src
npm install
npm test
npm run build
cd ..

aws cloudformation package --template-file macro.yaml --s3-bucket ${SAM_BUCKET} --s3-prefix ${STACK_NAME} --output-template-file macro.packaged.yaml

aws cloudformation deploy --template-file macro.packaged.yaml --stack-name ${STACK_NAME} --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset